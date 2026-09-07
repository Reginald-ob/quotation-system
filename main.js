// auth.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 初始化 Supabase 客戶端
const supabaseUrl = 'https://dtiqhctodehiqjodupwg.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aXFoY3RvZGVoaXFqb2R1cHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3Njg3NjUsImV4cCI6MjEwNDM0NDc2NX0.H1Do3LD82XgkPGLL5Inp5zMu4PlPQ2vqE7vSO00H0OI';
const supabase = createClient(supabaseUrl, supabaseKey);

// 檢查當前登入狀態 (首次訪問防護)
export async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (session) {
    console.log('已自動登入，跳轉至購物頁面');
    // 執行 SPA 視圖切換或 window.location.href = '/shop.html';
    return session.user;
  }
  return null;
}

// 執行登入
async function executeLogin() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    alert('請輸入帳號與密碼');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    alert('登入失敗，請檢查帳號密碼。');
    console.error('Auth Error:', error.message);
  } else {
    console.log('登入成功', data.user);
    // 執行 SPA 視圖切換至主畫面
  }
}

// 綁定事件監聽
document.getElementById('login-btn')?.addEventListener('click', executeLogin);

// 頁面載入時檢查 Session
document.addEventListener('DOMContentLoaded', checkSession);