// Simple cart stored in localStorage as array of items { id, name, price_in_paise, qty }
function getCart(){
  try { return JSON.parse(localStorage.getItem('fb_cart_v1') || '[]'); } catch { return []; }
}
function saveCart(cart){ localStorage.setItem('fb_cart_v1', JSON.stringify(cart)); }

function addToCart(item){
  const cart = getCart();
  const found = cart.find(i => i.id === item.id);
  if(found){ found.qty += 1; } else { cart.push({ ...item, qty: 1 }); }
  saveCart(cart);
}

function renderCartSidebar(){
  const cart = getCart();
  const container = document.getElementById('cart-items');
  if(!container) return;
  container.innerHTML = '';
  cart.forEach(i => {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.innerHTML = `<strong>${i.name}</strong><div>₹${(i.price_in_paise/100).toFixed(2)} x ${i.qty}</div>`;
    container.appendChild(div);
  });
  const total = cart.reduce((s, it) => s + it.price_in_paise * it.qty, 0);
  const el = document.getElementById('cart-total');
  if(el) el.textContent = `₹${(total/100).toFixed(2)}`;
}

function renderCartLarge(){
  const cart = getCart();
  const container = document.getElementById('cart-items-large');
  if(!container) return;
  container.innerHTML = '';
  cart.forEach(i => {
    const row = document.createElement('div');
    row.style.padding = '12px';
    row.style.border = '1px solid #eee';
    row.style.marginBottom = '8px';
    row.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>${i.name}</strong><div style="color:#6b7280">₹${(i.price_in_paise/100).toFixed(2)} x ${i.qty}</div></div><div></div></div>`;
    container.appendChild(row);
  });
  const total = cart.reduce((s, it) => s + it.price_in_paise * it.qty, 0);
  const el = document.getElementById('cart-total-large');
  if(el) el.textContent = `₹${(total/100).toFixed(2)}`;
}

// on load render
document.addEventListener('DOMContentLoaded', () => {
  renderCartSidebar();
  renderCartLarge();
});

// Expose helper used by checkout
function getCartForCheckout(){
  return getCart().map(i => ({ id: i.id, name: i.name, price_in_paise: i.price_in_paise, qty: i.qty }));
}

window.getCartForCheckout = getCartForCheckout;
