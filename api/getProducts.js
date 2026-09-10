export default async function handler(req, res) {
  // 1. 允許跨域請求 (解決 Failed to fetch)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // 處理 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { sheet = '日用品' } = req.query;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheet}?key=${apiKey}`);
    const data = await response.json();

    if (data.error) return res.status(400).json({ error: data.error.message });
    if (!data.values || data.values.length <= 1) return res.status(200).json({});

    const products = {};

    // 略過表頭 (第一列)
    data.values.slice(1).forEach(row => {
      // 支援全形與半形逗號拆分
      const skuIds = (row[0] || '').split(/[,，]/).map(s => s.trim());
      const name = (row[1] || '').trim();
      const specs = (row[2] || '').split(/[,，]/).map(s => s.trim());
      const prices = (row[3] || '').split(/[,，]/).map(s => parseFloat(s.replace(/[^\d.-]/g, '')) || 0);
      const images = (row[4] || '').split(/[,，]/).map(s => s.trim());
      const description = (row[5] || '').trim(); // F欄：產品介紹

      // 以第一個 ID 或隨機字串作為主產品 ID
      const mainId = skuIds[0] || `P-${Math.random().toString(36).substr(2, 5)}`;

      // 組合變體 (Variants)
      const variants = specs.map((specName, index) => ({
        skuId: skuIds[index] || `${mainId}-${index}`,
        specName: specName,
        // 若價格或圖片數量不足，預設抓取陣列的第一個值
        price: prices[index] !== undefined ? prices[index] : (prices[0] || 0),
        image: images[index] || images[0] || 'https://via.placeholder.com/150'
      }));

      // 抓取最低起步價
      const minPrice = variants.length > 0 ? Math.min(...variants.map(v => v.price)) : 0;

      products[mainId] = {
        id: mainId,
        name: name,
        description: description,
        minPrice: minPrice,
        variants: variants
      };
    });

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
}