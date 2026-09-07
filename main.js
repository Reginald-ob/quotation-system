// 初始化 Supabase 客戶端
const supabaseUrl = 'https://dtiqhctodehiqjodupwg.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aXFoY3RvZGVoaXFqb2R1cHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3Njg3NjUsImV4cCI6MjEwNDM0NDc2NX0.H1Do3LD82XgkPGLL5Inp5zMu4PlPQ2vqE7vSO00H0OI';
const supabase = createClient(supabaseUrl, supabaseKey);

// 全域狀態管理
let cartState = {}; 
let currentProducts = {}; 

// 2. 登入與視圖控制
document.addEventListener('DOMContentLoaded', checkSession);
document.getElementById('login-btn').addEventListener('click', executeLogin);

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) initAppView(session.user);
}

async function executeLogin() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) return alert('登入失敗');
  initAppView(data.user);
}

function initAppView(user) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'flex';
  document.getElementById('user-info').innerText = `帳號: ${user.email}`;
  window.loadCategory('羽球拍'); // 載入預設分類
}

// 3. 資料獲取與渲染
window.loadCategory = async function(categorySheet) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '<h3>資料載入中...</h3>';
  
  try {
    const response = await fetch(`/api/getProducts?sheet=${categorySheet}`);
    if (!response.ok) throw new Error('API 請求失敗');
    
    currentProducts = await response.json();
    renderProductGrid(currentProducts);
  } catch (error) {
    grid.innerHTML = '<h3 style="color:red;">資料載入失敗。</h3>';
  }
};

function renderProductGrid(products) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '';

  for (const [productId, product] of Object.entries(products)) {
    const minPrice = Math.min(...product.specs.map(s => s.price));
    
    const specsHtml = product.specs.map((spec, index) => {
      const currentQty = cartState[productId]?.specs[index]?.qty || 0;
      return `
        <div class="spec-row">
          <span>${spec.spec} <br><small>$${spec.price}</small></span>
          <div>
            <button class="qty-btn" onclick="updateQty('${productId}', ${index}, -1)">-</button>
            <span style="margin: 0 10px;" id="qty-${productId}-${index}">${currentQty}</span>
            <button class="qty-btn" onclick="updateQty('${productId}', ${index}, 1)">+</button>
          </div>
        </div>
      `;
    }).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${product.coverImage}" alt="${product.name}">
      <h3 style="margin-bottom: 5px;">${product.name}</h3>
      <div style="color: var(--primary-orange); font-weight: bold; margin-bottom: 10px;">最低報價: $${minPrice}</div>
      <div class="specs-container">${specsHtml}</div>
    `;
    grid.appendChild(card);
  }
}

// 4. 購物車狀態計算
window.updateQty = function(productId, specIndex, change) {
  if (!cartState[productId]) {
    cartState[productId] = { name: currentProducts[productId].name, isChecked: true, specs: {} };
  }
  if (!cartState[productId].specs[specIndex]) {
    cartState[productId].specs[specIndex] = {
      specName: currentProducts[productId].specs[specIndex].spec,
      price: currentProducts[productId].specs[specIndex].price,
      qty: 0
    };
  }

  let newQty = cartState[productId].specs[specIndex].qty + change;
  if (newQty < 0) newQty = 0;
  
  cartState[productId].specs[specIndex].qty = newQty;
  document.getElementById(`qty-${productId}-${index}`).innerText = newQty;

  if (newQty === 0) delete cartState[productId].specs[specIndex];
  if (Object.keys(cartState[productId].specs).length === 0) delete cartState[productId];

  calculateCartTotal();
};

function calculateCartTotal() {
  let totalQty = 0, totalAmount = 0;
  for (const productId in cartState) {
    if (cartState[productId].isChecked) {
      for (const specIndex in cartState[productId].specs) {
        const item = cartState[productId].specs[specIndex];
        totalQty += item.qty;
        totalAmount += (item.qty * item.price);
      }
    }
  }
  document.getElementById('cart-total-qty').innerText = totalQty;
  document.getElementById('cart-total-amount').innerText = totalAmount;
}