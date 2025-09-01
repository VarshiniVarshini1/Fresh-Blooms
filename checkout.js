// Create Stripe Checkout session via backend
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('start-checkout');
  const summary = document.getElementById('checkout-summary');
  const msg = document.getElementById('msg');

  function renderSummary(){
    const cart = window.getCartForCheckout();
    if(cart.length===0){ summary.innerHTML = '<p>Your cart is empty.</p>'; if(btn) btn.disabled=true; return; }
    let html = '<ul>';
    let total=0;
    cart.forEach(i=>{ html += `<li>${i.name} — ₹${(i.price_in_paise/100).toFixed(2)} x ${i.qty}</li>`; total += i.price_in_paise*i.qty; });
    html += '</ul>';
    html += `<div><strong>Total: ₹${(total/100).toFixed(2)}</strong></div>`;
    summary.innerHTML = html;
  }
  renderSummary();

  btn && btn.addEventListener('click', async ()=>{
    const items = window.getCartForCheckout();
    if(items.length===0) return alert('Cart is empty');
    const email = document.getElementById('email').value;
    btn.disabled = true; btn.textContent = 'Redirecting...';
    try{
      const res = await fetch('/api/create-checkout-session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items, customer_email: email }) });
      const data = await res.json();
      if(data.url){
        localStorage.removeItem('fb_cart_v1'); // clear local cart (optional)
        window.location = data.url; // redirect to Stripe Checkout
      } else {
        msg.textContent = 'Failed to create checkout session';
        console.error(data);
      }
    }catch(err){ console.error(err); msg.textContent = 'Error creating checkout session'; }
  });
});
