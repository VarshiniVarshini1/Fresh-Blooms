require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('./db');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4242;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:4242';

// serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cors());
app.use(bodyParser.json());

// API: get products
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description, image_url, price_in_paise, stock FROM products WHERE active = 1');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create checkout session - expects { items: [{ id, name, price_in_paise, qty }], customer_email }
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items, customer_email } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items' });

    // Build Stripe line_items and attach product_id inside product_data.metadata for mapping in webhook
    const line_items = items.map(it => ({
      price_data: {
        currency: 'inr',
        product_data: {
          name: it.name,
          metadata: { product_id: String(it.id) } // important: map to our product id
        },
        unit_amount: it.price_in_paise
      },
      quantity: it.qty
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      customer_email: customer_email || undefined,
      success_url: `${YOUR_DOMAIN}/checkout.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/cart.html`
    });

    // Optionally: create a pending order row with session id and status 'pending' (helps reconcile)
    try {
      const [result] = await pool.query(
        'INSERT INTO orders (stripe_session_id, customer_email, total_amount_paise, status, created_at) VALUES (?, ?, ?, ?, NOW())',
        [session.id, customer_email || null, session.amount_total || 0, 'pending']
      );
      // store order id mapping in session metadata? Can't modify session after creation in test easily.
    } catch (dbErr) {
      console.error('Warning: failed to insert pending order:', dbErr);
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook to handle checkout.session.completed and map line items back to product ids
// Stripe requires raw body for signature verification
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      // Retrieve line items and expand price.product to access metadata
      const sessionWithLineItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price.product']
      });
      const lineItems = sessionWithLineItems.line_items.data;

      // Begin DB transaction: insert order (or update existing pending), insert order_items, decrement stock
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Update existing pending order matching stripe_session_id if exists, else insert new
        let orderId;
        const [existing] = await conn.query('SELECT id FROM orders WHERE stripe_session_id = ?', [session.id]);
        if (existing.length > 0) {
          orderId = existing[0].id;
          await conn.query('UPDATE orders SET status = ?, total_amount_paise = ? WHERE id = ?', ['paid', session.amount_total, orderId]);
        } else {
          const [r] = await conn.query('INSERT INTO orders (stripe_session_id, customer_email, total_amount_paise, status, created_at) VALUES (?, ?, ?, ?, NOW())', [session.id, session.customer_email || null, session.amount_total || 0, 'paid']);
          orderId = r.insertId;
        }

        // For each line item, try to read product_id from price.product.metadata.product_id
        for (const li of lineItems) {
          const qty = li.quantity;
          const unit_amount = li.price.unit_amount;
          let product_id = null;
          try {
            if (li.price && li.price.product && li.price.product.metadata && li.price.product.metadata.product_id) {
              product_id = parseInt(li.price.product.metadata.product_id, 10);
            }
          } catch (e) {
            product_id = null;
          }
          if (product_id) {
            // insert order_items with product_id
            await conn.query('INSERT INTO order_items (order_id, product_id, product_name, unit_price_paise, quantity) VALUES (?, ?, ?, ?, ?)', [orderId, product_id, li.description || li.price.product.name || 'Unknown', unit_amount, qty]);
            // decrement stock
            await conn.query('UPDATE products SET stock = GREATEST(stock - ?, 0) WHERE id = ?', [qty, product_id]);
          } else {
            // fallback: insert with no product_id, store name
            const productName = li.description || (li.price && li.price.product && li.price.product.name) || 'Unknown';
            await conn.query('INSERT INTO order_items (order_id, product_name, unit_price_paise, quantity) VALUES (?, ?, ?, ?)', [orderId, productName, unit_amount, qty]);
          }
        }

        await conn.commit();
        console.log('Order processed and saved. order id =', orderId);
      } catch (dbErr) {
        await conn.rollback();
        console.error('DB error while saving order from webhook:', dbErr);
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('Failed processing checkout.session.completed:', err);
    }
  }

  res.json({ received: true });
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
