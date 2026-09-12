import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let currentUser = null; // 用於儲存當前登入使用者資訊

// 1. 初始化 Supabase (請於 Vercel 環境變數配置或暫時替換為實際金鑰)
const supabaseUrl = 'https://dtiqhctodehiqjodupwg.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aXFoY3RvZGVoaXFqb2R1cHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3Njg3NjUsImV4cCI6MjEwNDM0NDc2NX0.H1Do3LD82XgkPGLL5Inp5zMu4PlPQ2vqE7vSO00H0OI';
const supabase = createClient(supabaseUrl, supabaseKey);

// 全域狀態管理
let cartState = {}; 
let currentProducts = {}; 
let allProducts = {};
let currentProfile = null;

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

// 初始化視圖 (更新)
async function initAppView(user) {
  currentUser = user; 
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'flex';
  
  // 載入或引導建檔 6 位數客戶編號與單位名稱
  await loadUserProfile(user);

  const adminEmails = ['daidai@admin.com', 'admin@admin.com'];
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn) {
    adminBtn.style.display = adminEmails.includes(user.email) ? 'inline-block' : 'none';
  }

  window.loadCategory('日用品'); 
}

// 處理用戶資料建檔與讀取
async function loadUserProfile(user) {
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // 若尚未建檔，引導輸入姓名/單位名稱並自動生成 6 位數編號
  if (!profile) {
    let inputName = prompt("【首次登入建檔】請輸入您的「真實姓名」或「公司/球館單位名稱」：");
    inputName = (inputName && inputName.trim()) ? inputName.trim() : "未命名客戶";

    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert([{ id: user.id, email: user.email, name: inputName }])
      .select()
      .single();
      
    profile = newProfile;
  } else if (!profile.name || profile.name.trim() === '' || profile.name === '未命名客戶') {
    let inputName = prompt("請補填您的「姓名」或「公司單位名稱」，以便管理員核對訂單：");
    if (inputName && inputName.trim()) {
      await supabase.from('profiles').update({ name: inputName.trim() }).eq('id', user.id);
      profile.name = inputName.trim();
    }
  }

  currentProfile = profile;
  document.getElementById('user-info').innerText = `客戶編號: #${profile?.user_no || '------'} | ${profile?.name || user.email}`;
}

window.loadCategory = async function(categorySheet) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '<p style="padding: 20px;">載入商品中，請稍候...</p>';

  try {
    const response = await fetch(`/api/getProducts?sheet=${encodeURIComponent(categorySheet)}`);
    const data = await response.json();

    if (data.error) {
      grid.innerHTML = `<p style="color:red; padding:20px;">發生錯誤: ${data.error}</p>`;
      return;
    }
    
    if (Object.keys(data).length === 0) {
      grid.innerHTML = '<p style="padding: 20px;">此分類目前無商品或工作表為空。</p>';
      return;
    }

    allProducts = data;
    grid.innerHTML = ''; // 清空 loading 提示

    // --- 這裡就是修改一的蝦皮風格網格渲染 ---
    Object.values(allProducts).forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      
      // 點擊整張卡片喚出彈窗 (傳入 product.id)
      card.onclick = () => openModal(product.id);
      
      // 僅顯示圖片、品名、最低起步價
      card.innerHTML = `
        <img src="${product.variants[0].image}" alt="${product.name}" loading="lazy">
        <div class="info">
          <p class="title">${product.name}</p>
          <p class="price">$${product.minPrice}</p>
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (err) {
    console.error("API 請求失敗", err);
    grid.innerHTML = '<p style="color:red; padding: 20px;">無法連線至伺服器，請稍後再試。</p>';
  }
};

window.switchCategory = function(button, categorySheet) {
  document.querySelectorAll('.sidebar-btn').forEach(categoryButton => {
    categoryButton.classList.remove('active');
  });
  button.classList.add('active');
  window.loadCategory(categorySheet);
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

// ================= 5. 結帳與寫入資料庫邏輯 (稅額計算修正版) =================
document.getElementById('checkout-btn').addEventListener('click', processCheckout);

async function processCheckout() {
  const totalAmountStr = document.getElementById('cart-total-amount').innerText;
  
  // 1. 金額計算：商品售價已為含稅價
  const finalTotal = parseInt(totalAmountStr, 10); // 應付總額 (含稅合計)
  if (isNaN(finalTotal) || finalTotal === 0) return alert('請至少選擇一項商品且數量大於 0');

  const untaxedAmount = Math.round(finalTotal / 1.05); // 商品總計 (未稅)
  const taxAmount = finalTotal - untaxedAmount;        // 營業稅 (5%)

  // 2. 生成訂單編號 (2 英文字母 + 5 碼數字)
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetters = letters[Math.floor(Math.random() * 26)] + letters[Math.floor(Math.random() * 26)];
  const randomNumbers = Math.floor(10000 + Math.random() * 90000);
  const orderId = `${randomLetters}${randomNumbers}`;

  // 3. 雙軌判斷門檻 ($500)
  const isPayable = finalTotal > 500;
  const adminNote = isPayable ? null : '該訂單未達預付貨款門檻，入庫後連同運費合併結帳';

  // 4. 序列化商品明細
  const orderItems = [];
  let itemsHtml = '';

  for (const pid in cartState) {
    if (cartState[pid].isChecked) {
      let specHtml = '';
      const specsArray = [];
      
      for (const specKey in cartState[pid].specs) {
        const item = cartState[pid].specs[specKey];
        specsArray.push(item);
        specHtml += `<div style="margin-left: 10px; color: #555; font-size: 0.9em;">- ${specKey} (x${item.qty}) : $${item.qty * item.price}</div>`;
      }
      
      orderItems.push({
        product_id: pid,
        name: cartState[pid].name,
        specs: specsArray
      });

      itemsHtml += `
        <div style="margin-bottom: 10px; border-bottom: 1px dashed #eee; padding-bottom: 10px;">
          <strong style="font-size: 0.95em;">${cartState[pid].name}</strong>
          ${specHtml}
        </div>
      `;
    }
  }

  // 5. 寫入 Supabase (儲存客戶 6 碼編號與單位名稱)
  const payload = {
    order_id: orderId,
    user_id: currentUser.id,
    user_no: currentProfile ? currentProfile.user_no : null,
    user_name: currentProfile ? currentProfile.name : '未填寫',
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
    return alert('建立訂單失敗: ' + error.message);
  }

  // 6. 建單成功：清空本地購物車
  cartState = {};
  calculateCartTotal();
  if (typeof closeCartModal === 'function') closeCartModal();

  // 7. 渲染結帳頁面明細 (顯示修正後的稅額)
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('checkout-view').style.display = 'block';
  
  document.getElementById('checkout-summary').innerHTML = `
    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e9ecef;">
      <p style="margin-top: 0; font-size: 1.1em;">訂單編號: <strong>${orderId}</strong></p>
      
      <h4 style="margin-bottom: 10px; border-bottom: 2px solid #ccc; padding-bottom: 5px; color: #333;">訂單明細</h4>
      <div style="max-height: 250px; overflow-y: auto; margin-bottom: 10px; padding-right: 5px;">
        ${itemsHtml}
      </div>

      <div style="margin-top: 15px; text-align: right; border-top: 2px solid #ccc; padding-top: 10px;">
        <p style="margin: 5px 0;">商品總計 (未稅): $${untaxedAmount}</p>
        <p style="margin: 5px 0;">營業稅 (5%): $${taxAmount}</p>
        <h3 style="color: var(--primary-orange); margin: 10px 0 0 0;">應付總額 (含稅): $${finalTotal}</h3>
      </div>
    </div>
  `;

  if (isPayable) {
    document.getElementById('remittance-form').style.display = 'flex';
    document.getElementById('low-amount-warning').style.display = 'none';
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
  document.getElementById('admin-view').style.display = 'none';
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
        <p style="color: #444; font-size: 0.95em; margin: 6px 0;">
          客戶編號: <strong style="color: #007bff;">#${order.user_no || '舊單無編號'}</strong> | 
          單位名稱: <strong>${order.user_name || '未建檔'}</strong>
        </p>
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

// ================= 9. 商品彈窗與選購邏輯 =================
let currentModalProduct = null;
let currentSelectedVariant = null;
let currentModalQty = 0; // 預設值改為 0

// 開啟彈窗
window.openModal = function(productId) {
  currentModalProduct = allProducts[productId];
  currentSelectedVariant = currentModalProduct.variants[0]; // 預設選取第一個規格
  currentModalQty = 0; // 每次開啟彈窗時，數量預設為 0
  
  document.getElementById('modal-name').innerText = currentModalProduct.name;
  document.getElementById('modal-desc').innerText = currentModalProduct.description || '暫無詳細介紹。';
  document.getElementById('modal-qty-input').value = currentModalQty; // 更新 UI
  document.getElementById('product-modal').style.display = 'flex';
  
  renderModalSpecs();
};

// 渲染彈窗內的動態數據(圖、價、規格按鈕)
window.renderModalSpecs = function() {
  document.getElementById('modal-img').src = currentSelectedVariant.image;
  document.getElementById('modal-price').innerText = `$${currentSelectedVariant.price}`;
  
  const specsContainer = document.getElementById('modal-specs');
  specsContainer.innerHTML = currentModalProduct.variants.map(v => `
    <button class="spec-btn ${currentSelectedVariant.skuId === v.skuId ? 'selected' : ''}" 
            onclick="selectSpec('${v.skuId}')">${v.specName}</button>
  `).join('');
};

// 切換規格
window.selectSpec = function(skuId) {
  currentSelectedVariant = currentModalProduct.variants.find(v => v.skuId === skuId);
  renderModalSpecs();
};

// 處理彈窗內的數量增減按鈕
window.changeModalQty = function(change) {
  currentModalQty += change;
  if (currentModalQty < 0) currentModalQty = 0; // 最低為 0
  document.getElementById('modal-qty-input').value = currentModalQty;
};

// 新增：處理手動輸入數量的同步與防呆
window.onModalQtyInputChange = function(input) {
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) {
    val = 0;
  }
  currentModalQty = val;
};

// 關閉彈窗
window.closeModal = function() {
  document.getElementById('product-modal').style.display = 'none';
};

document.getElementById('product-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// 從彈窗加入購物車
window.addToCartFromModal = function() {
  // 確保取得當前輸入框內的最新數值
  const qtyInputVal = parseInt(document.getElementById('modal-qty-input').value, 10);
  currentModalQty = isNaN(qtyInputVal) ? 0 : qtyInputVal;

  if (currentModalQty <= 0) {
    return alert('請輸入大於 0 的採購數量');
  }

  const prodId = currentModalProduct.id;
  const variant = currentSelectedVariant;
  const specKey = variant.specName;
  
  if (!cartState[prodId]) {
    cartState[prodId] = { name: currentModalProduct.name, isChecked: true, specs: {} };
  }
  
  if (!cartState[prodId].specs[specKey]) {
    cartState[prodId].specs[specKey] = {
      specName: specKey,
      price: variant.price,
      qty: 0
    };
  }
  
  cartState[prodId].specs[specKey].qty += currentModalQty;
  
  calculateCartTotal(); 
  closeModal();
  
  alert(`已將 ${currentModalQty} 件 ${currentModalProduct.name} (${specKey}) 加入採購車`);
};

// ================= 10. 採購車明細彈窗邏輯 =================
window.openCartModal = function() {
  const container = document.getElementById('cart-items-container');
  container.innerHTML = '';
  let totalAmount = 0;
  let hasItems = false;

  for (const pid in cartState) {
    if (cartState[pid].isChecked) {
      for (const specKey in cartState[pid].specs) {
        const item = cartState[pid].specs[specKey];
        if (item.qty > 0) {
          hasItems = true;
          totalAmount += item.qty * item.price;
          
          const itemDiv = document.createElement('div');
          itemDiv.style = "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #ccc; padding: 10px 0;";
          itemDiv.innerHTML = `
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 0.95em;">${cartState[pid].name}</div>
              <div style="color: #666; font-size: 0.85em;">規格: ${specKey}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="color: #ee4d2d; font-weight: bold;">$${item.price}</div>
              <div style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                <button onclick="updateCartItemQty('${pid}', '${specKey}', -1)" style="padding: 2px 10px; background: #f8f9fa; border: none; border-right: 1px solid #ccc; cursor: pointer;">-</button>
                <span style="width: 35px; text-align: center; font-size: 0.9em;">${item.qty}</span>
                <button onclick="updateCartItemQty('${pid}', '${specKey}', 1)" style="padding: 2px 10px; background: #f8f9fa; border: none; border-left: 1px solid #ccc; cursor: pointer;">+</button>
              </div>
            </div>
          `;
          container.appendChild(itemDiv);
        }
      }
    }
  }

  if (!hasItems) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px 0;">採購車目前是空的</p>';
  }
  
  document.getElementById('cart-modal-total').innerText = totalAmount;
  document.getElementById('cart-modal').style.display = 'flex';
};

window.closeCartModal = function() {
  document.getElementById('cart-modal').style.display = 'none';
};

// 點擊遮罩關閉採購車彈窗
document.getElementById('cart-modal').addEventListener('click', function(e) {
  if (e.target === this) closeCartModal();
});

// 在採購車內直接修改數量
window.updateCartItemQty = function(pid, specKey, change) {
  if (cartState[pid] && cartState[pid].specs[specKey]) {
    cartState[pid].specs[specKey].qty += change;
    
    // 若數量歸零則刪除該規格
    if (cartState[pid].specs[specKey].qty <= 0) {
      delete cartState[pid].specs[specKey];
    }
    // 若該產品已無任何規格則刪除該產品
    if (Object.keys(cartState[pid].specs).length === 0) {
      delete cartState[pid];
    }
    
    calculateCartTotal(); // 重新計算底部總金額
    openCartModal();      // 重新渲染彈窗畫面
  }
};