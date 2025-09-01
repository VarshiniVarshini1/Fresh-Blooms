// Fetch products and render
async function loadProducts(){
  try{
    const res = await fetch('/api/products');
    const products = await res.json();
    const grid = document.getElementById('products-grid');
    products.forEach(p => {
      const el = document.createElement('article');
      el.className = 'card';
      el.innerHTML = `
        <img src="${p.image_url}" alt="${p.name}">
        <div class="pad">
          <h4>${p.name}</h4>
          <p style="color:#6b7280;margin:6px 0">₹${(p.price_in_paise/100).toFixed(2)}</p>
          <button class="btn" data-id="${p.id}" data-price="${p.price_in_paise}" data-name="${p.name}">Add to cart</button>
        </div>
      `;
      grid.appendChild(el);
    });

    // attach handlers
    grid.addEventListener('click', e => {
      if(e.target.tagName === 'BUTTON'){
        const id = e.target.dataset.id;
        const price = parseInt(e.target.dataset.price,10);
        const name = e.target.dataset.name;
        addToCart({ id, name, price_in_paise: price });
        renderCartSidebar();
      }
    });
  }catch(err){console.error(err)}
}

loadProducts();
