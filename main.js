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
  
  // 判定並顯示管理員按鈕
  const adminEmails = ['daidai@admin.com', 'admin@admin.com'];
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn) {
    adminBtn.style.display = adminEmails.includes(user.email) ? 'inline-block' : 'none';
  }

  window.loadCategory('羽球拍'); 
}

// 3. 資料獲取與渲染
window.loadCategory = async function(categorySheet) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '<h3>資料載入中...</h3>';
  
  try {
    const response = await fetch(`https://quotation-system-xi-blue.vercel.app/api/getProducts?sheet=${categorySheet}`);
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

// ================= 6. 匯款表單送出邏輯 =================
document.getElementById('submit-remittance-btn')?.addEventListener('click', async (e) => {
  const btn = e.target;
  const orderId = btn.dataset.orderId;
  const bankLast5 = document.getElementById('bank-last-5').value;
  const taxId = document.getElementById('tax-id').value;

  if (!bankLast5 || bankLast5.length !== 5) return alert('請填寫正確的帳戶後 5 碼數字');

  btn.innerText = '處理中...';
  btn.disabled = true;

  // 執行 UPDATE 操作，將狀態改為「匯款待查」
  const { error } = await supabase
    .from('orders')
    .update({
      status: '匯款待查',
      account_last_5: bankLast5,
      tax_id: taxId
    })
    .eq('order_id', orderId)
    .eq('user_id', currentUser.id); // 確保只能更新自己的訂單

  btn.innerText = '確認送出匯款資訊';
  btn.disabled = false;

  if (error) {
    console.error(error);
    return alert('匯款資訊送出失敗，請稍後再試。');
  }

  alert('匯款資訊已成功送出，等待管理員核帳。');
  loadMyOrders(); // 成功後跳轉至我的訂單頁面
});

// ================= 7. 我的訂單與視圖切換邏輯 =================
let allMyOrders = []; // 暫存歷史訂單

// 切換回購物主畫面
window.showAppView = function() {
  document.getElementById('checkout-view').style.display = 'none';
  document.getElementById('orders-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'flex';
};

// 載入我的訂單 (更新：每次載入時重置標籤顏色至「未付款」)
window.loadMyOrders = async function() {
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('orders-view').style.display = 'block';
  
  const container = document.getElementById('orders-list-container');
  container.innerHTML = '<p>訂單載入中...</p>';

  // 重置分頁按鈕 UI 狀態為第一項 (未付款)
  const tabs = document.querySelectorAll('.order-tab-btn');
  tabs.forEach(tab => tab.classList.remove('active'));
  if(tabs[0]) tabs[0].classList.add('active'); 

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false }); 

  if (error) {
    console.error(error);
    return container.innerHTML = '<p style="color:red;">載入失敗</p>';
  }

  allMyOrders = data;
  renderOrdersList('未付款'); 
};

// 處理標籤點擊後的顏色切換與資料渲染
window.switchOrderTab = function(btnElement, statusCategory) {
  // 1. 移除所有訂單分頁標籤的 active 狀態
  const tabs = document.querySelectorAll('.order-tab-btn');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  // 2. 將當前點擊的標籤加上 active 狀態 (改變橘色邊框)
  btnElement.classList.add('active');
  
  // 3. 呼叫原本的渲染邏輯重新顯示卡片
  renderOrdersList(statusCategory);
};

// 渲染指定狀態的訂單列表
window.renderOrdersList = function(statusCategory) {
  const container = document.getElementById('orders-list-container');
  container.innerHTML = '';

  // 過濾訂單 (將「匯款待查」歸類在「進行中」分頁顯示)
  const filteredOrders = allMyOrders.filter(order => {
    if (statusCategory === '進行中') return order.status === '進行中' || order.status === '匯款待查';
    return order.status === statusCategory;
  });

  if (filteredOrders.length === 0) {
    return container.innerHTML = `<p>目前沒有${statusCategory}的訂單。</p>`;
  }

  filteredOrders.forEach(order => {
    const isPayable = order.is_payable;
    
    // 生成商品明細 HTML
    const itemsHtml = order.order_items.map(item => `
      <div style="font-size: 0.9em; border-bottom: 1px dashed #ccc; padding: 5px 0;">
        <strong>${item.name}</strong><br>
        ${item.specs.map(s => `<span style="display:inline-block; margin-right:10px;">- ${s.specName} (x${s.qty}) : $${s.qty * s.price}</span>`).join('')}
      </div>
    `).join('');

    // --- 前端邏輯：判定備註與改價狀態 ---
    const isLowAmount = !isPayable && order.status === '未付款';
    // 若 admin_note 存在 (包含空字串 "")，且不是系統預設警告，代表管理員已操作改價/備註
    const isAdjusted = order.admin_note !== null && 
                       order.admin_note !== undefined && 
                       order.admin_note !== '該訂單未達預付貨款門檻，入庫後連同運費合併結帳';
    
    let warningHtml = '';
    if (isLowAmount) {
      // 系統預設：未達門檻黃字警告
      warningHtml = `<div style="color: #856404; background: #fff3cd; padding: 8px; margin-top: 10px; font-size: 0.9em; border-radius: 4px;">${order.admin_note}</div>`;
    } else if (isAdjusted) {
      // 管理員改價：紅字警告與備註顯示
      warningHtml = `
        <div style="color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; margin-top: 10px; font-size: 0.9em; border-radius: 4px;">
          <strong style="display: block; margin-bottom: 5px;">⚠️ 訂單已改價，匯款前請務必確認金額無誤！</strong>
          ${order.admin_note.trim() !== '' ? `<span style="color: #333;">管理員備註: ${order.admin_note}</span>` : ''}
        </div>
      `;
    }
    // ------------------------------------

    const card = document.createElement('div');
    card.style = 'border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #fafafa;';
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span style="font-weight: bold; color: var(--primary-orange);">訂單編號: ${order.order_id}</span>
        <span style="background: #eee; padding: 3px 8px; border-radius: 4px; font-size: 0.85em;">${order.status}</span>
      </div>
      ${itemsHtml}
      <div style="margin-top: 10px; font-weight: bold; text-align: right;">
        總計金額 (含稅): $${order.total_amount}
      </div>
      ${warningHtml}
      ${isPayable && order.status === '未付款' ? `<button class="btn-orange" style="margin-top: 10px; width: 100%;" onclick="resumeCheckout('${order.order_id}', ${order.total_amount})">前往匯款</button>` : ''}
    `;
    container.appendChild(card);
  });
};

// 恢復中斷的匯款流程
window.resumeCheckout = function(orderId, totalAmount) {
  document.getElementById('orders-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'block';
  document.getElementById('remittance-form').style.display = 'flex';
  document.getElementById('low-amount-warning').style.display = 'none';
  
  document.getElementById('checkout-summary').innerHTML = `
    <p>訂單編號: <strong>${orderId}</strong></p>
    <h3 style="color: var(--primary-orange);">應付總額: $${totalAmount}</h3>
  `;
  document.getElementById('submit-remittance-btn').dataset.orderId = orderId;
};

// ================= 8. 管理員後台邏輯 =================
window.loadAdminPanel = async function() {
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'none';
  document.getElementById('orders-view').style.display = 'none';
  document.getElementById('admin-view').style.display = 'block';

  const container = document.getElementById('admin-orders-container');
  container.innerHTML = '<p>載入所有訂單中...</p>';

  // 獲取狀態為未付款與匯款待查的訂單
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['未付款', '匯款待查'])
    .order('created_at', { ascending: false });

  if (error) return container.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
  if (!data || data.length === 0) return container.innerHTML = '<p>目前沒有需要處理的訂單。</p>';

  container.innerHTML = '';
  data.forEach(order => {
    const card = document.createElement('div');
    card.style = 'border: 1px solid #ccc; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #fff;';
    
    let actionHtml = '';
    
    // 情境 A：未付款 (可修改總金額與備註)
    if (order.status === '未付款') {
      actionHtml = `
        <div style="background: #f8f9fa; padding: 10px; margin-top: 10px; border-radius: 4px;">
          <h4 style="margin-top: 0;">修改運費/金額</h4>
          <input type="number" id="admin-price-${order.order_id}" value="${order.total_amount}" style="padding: 5px; width: 100px;"> 
          <input type="text" id="admin-note-${order.order_id}" value="${order.admin_note || ''}" placeholder="新增備註 (選填)" style="padding: 5px; width: 250px;">
          <button id="btn-update-${order.order_id}" class="btn-orange" onclick="adminUpdateOrder('${order.order_id}')">更新訂單並解鎖結帳</button>
        </div>
      `;
    } 
    // 情境 B：匯款待查 (核准並轉為進行中)
    else if (order.status === '匯款待查') {
      actionHtml = `
        <div style="background: #e2e3e5; padding: 10px; margin-top: 10px; border-radius: 4px;">
          <h4 style="margin-top: 0; color: #383d41;">匯款審核</h4>
          <p>客戶統編: ${order.tax_id || '無'} | 帳戶後五碼: <strong style="color:red; font-size: 1.2em;">${order.account_last_5}</strong></p>
          <!-- 加入 id 以便控制狀態 -->
          <button id="btn-approve-${order.order_id}" class="btn-orange" style="background: #28a745;" onclick="adminApprovePayment('${order.order_id}')">確認已收款 (轉為進行中)</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 1.2em;">訂單號: ${order.order_id}</strong>
        <span style="background: #000; color:#fff; padding: 3px 8px; border-radius: 4px;">${order.status}</span>
      </div>
      <p style="color: #666; font-size: 0.9em;">用戶 ID: ${order.user_id}</p>
      <p>目前總額: <strong>$${order.total_amount}</strong></p>
      ${actionHtml}
    `;
    container.appendChild(card);
  });
};

// 2. 修復後的改價與狀態更新邏輯
window.adminUpdateOrder = async function(orderId) {
  const btn = document.getElementById(`btn-update-${orderId}`);
  const newPriceInput = document.getElementById(`admin-price-${orderId}`).value;
  const newNote = document.getElementById(`admin-note-${orderId}`).value;
  
  // 關鍵修復：強制轉型為整數，避免字串寫入 DECIMAL 欄位引發底層報錯
  const updatedPrice = parseInt(newPriceInput, 10);
  if (isNaN(updatedPrice) || updatedPrice < 0) return alert('請輸入有效的金額數值');

  // UI 防呆狀態
  btn.innerText = '更新中...';
  btn.disabled = true;

  const { error } = await supabase
    .from('orders')
    .update({ 
      total_amount: updatedPrice, 
      admin_note: newNote,
      is_payable: true // 強制解鎖客戶端的匯款表單
    })
    .eq('order_id', orderId);

  // 恢復 UI 狀態
  btn.innerText = '更新訂單並解鎖結帳';
  btn.disabled = false;

  if (error) return alert(`更新失敗: ${error.message}`);
  
  alert('訂單已更新！用戶端已解鎖匯款結帳功能。');
  loadAdminPanel(); // 重新整理後台列表以顯示最新狀態
};

// 3. 管理員核准匯款邏輯 (增強防呆與錯誤捕捉)
window.adminApprovePayment = async function(orderId) {
  const btn = document.getElementById(`btn-approve-${orderId}`);
  
  try {
    // 點擊後立即切換按鈕狀態，避免重複點擊與等待焦慮
    if (btn) {
      btn.innerText = '處理中...';
      btn.disabled = true;
    }

    const { error } = await supabase
      .from('orders')
      .update({ status: '進行中' })
      .eq('order_id', orderId);

    if (error) throw error; // 將 API 錯誤拋出給 catch 處理

    alert('已確認收款，訂單狀態轉為「進行中」。');
    loadAdminPanel(); // 成功後重新整理列表

  } catch (err) {
    console.error("核准失敗詳細資訊:", err);
    alert(`核准失敗: ${err.message || '未知錯誤，請檢查主控台'}`);
    
    // 若失敗，恢復按鈕狀態
    if (btn) {
      btn.innerText = '確認已收款 (轉為進行中)';
      btn.disabled = false;
    }
  }
};

//登出
window.logout = async function() {
  await supabase.auth.signOut();
  location.reload();
};