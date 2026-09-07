export default async function handler(req, res) {
  // 1. 設置 SWR 快取標頭 (邊緣快取 60 秒，1 小時內背景更新)
  res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=60, stale-while-revalidate=3600');

  // 允許 CORS 跨域請求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { sheet = 'Sheet1' } = req.query;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    return res.status(500).json({ error: '環境變數未設定' });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheet)}?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length === 0) {
      return res.status(404).json({ error: '找不到資料或工作表為空' });
    }

    // 移除表頭 (假設第一列為標題)
    const rows = data.values.slice(1);

    // 2. 資料清洗與 Hash Map 聚合降維
    const products = rows.reduce((acc, row) => {
      // 避免空列導致崩潰
      if (row.length < 5) return acc; 

      const [productId, productName, specName, price, imageUrl] = row;

      // 若該產品 ID 尚不存在，建立初始結構
      if (!acc[productId]) {
        acc[productId] = {
          name: productName,
          coverImage: imageUrl, // 預設取第一個規格的圖片為封面
          specs: []
        };
      }

      // 將子規格推入該產品的 specs 陣列
      acc[productId].specs.push({
        spec: specName,
        price: parseInt(price.replace(/,/g, ''), 10) || 0,
        image: imageUrl
      });

      return acc;
    }, {});

    return res.status(200).json(products);

  } catch (error) {
    return res.status(500).json({ error: '無法讀取 Google Sheets', details: error.message });
  }
}