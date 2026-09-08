import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let currentUser = null; // 用於儲存當前登入使用者資訊

// 1. 初始化 Supabase (請於 Vercel 環境變數配置或暫時替換為實際金鑰)
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
  
  if (error) {
    alert('登入失敗: ' + error.message);
    return;
  }
  initAppView(data.user);
}

function initAppView(user) {
  currentUser = user;
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
    console.error(error);
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
  
  // 修正變數未定義錯誤，精準更新 DOM 數量
  const qtyElement = document.getElementById(`qty-${productId}-${specIndex}`);
  if (qtyElement) qtyElement.innerText = newQty;

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

// ================= 5. 結帳與寫入資料庫邏輯 =================
document.getElementById('checkout-btn').addEventListener('click', processCheckout);

async function processCheckout() {
  const totalAmountStr = document.getElementById('cart-total-amount').innerText;
  const baseAmount = parseInt(totalAmountStr);
  
  if (baseAmount === 0) return alert('請至少選擇一項商品且數量大於 0');

  // 1. 計算金額與生成編號
  const taxAmount = Math.round(baseAmount * 0.05);
  const finalTotal = baseAmount + taxAmount;
  
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetters = letters[Math.floor(Math.random() * 26)] + letters[Math.floor(Math.random() * 26)];
  const randomNumbers = Math.floor(10000 + Math.random() * 90000);
  const orderId = `${randomLetters}${randomNumbers}`; // 2英+5數

  // 2. 雙軌判斷門檻 ($500)
  const isPayable = finalTotal > 500;
  const adminNote = isPayable ? null : '該訂單未達預付貨款門檻，入庫後連同運費合併結帳';

  // 3. 序列化商品明細
  const orderItems = [];
  for (const pid in cartState) {
    if (cartState[pid].isChecked) {
      orderItems.push({
        product_id: pid,
        name: cartState[pid].name,
        specs: Object.values(cartState[pid].specs)
      });
    }
  }

  // 4. 寫入 Supabase
  const payload = {
    order_id: orderId,
    user_id: currentUser.id,
    order_items: orderItems,
    total_amount: finalTotal,
    status: '未付款',
    order_type: 'normal',
    is_payable: isPayable,
    admin_note: adminNote
  };

  document.getElementById('checkout-btn').innerText = '處理中...';
  
  const { error } = await supabase.from('orders').insert([payload]);
  
  document.getElementById('checkout-btn').innerText = '前往結帳';

  if (error) {
    console.error(error);
    return alert('建立訂單失敗，請稍後再試。');
  }

  // 5. 建單成功：清空本地購物車
  cartState = {};
  calculateCartTotal();
  // 可選：重新渲染畫面上的數量歸零，或依賴跳轉後重新載入

  // 6. 視圖切換與 UI 渲染
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'block';
  
  document.getElementById('checkout-summary').innerHTML = `
    <p>訂單編號: <strong>${orderId}</strong></p>
    <p>商品總計: $${baseAmount}</p>
    <p>營業稅 (5%): $${taxAmount}</p>
    <h3 style="color: var(--primary-orange);">應付總額: $${finalTotal}</h3>
  `;

  if (isPayable) {
    document.getElementById('remittance-form').style.display = 'flex';
    document.getElementById('low-amount-warning').style.display = 'none';
    // 將 orderId 暫存於按鈕，供送出匯款表單時使用
    document.getElementById('submit-remittance-btn').dataset.orderId = orderId;
  } else {
    document.getElementById('remittance-form').style.display = 'none';
    document.getElementById('low-amount-warning').style.display = 'block';
  }
}