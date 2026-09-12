export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sheet = '日用品' } = req.query;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  try {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheet)}?key=${apiKey}`);
    const data = await response.json();

    if (data.error) return res.status(400).json({ error: data.error.message });
    if (!data.values || data.values.length <= 1) return res.status(200).json({});

    const products = {};

    data.values.slice(1).forEach(row => {
      const skuIds = (row[0] || '').split(/[,，]/).map(s => s.trim());
      const name = (row[1] || '').trim();
      const specs = (row[2] || '').split(/[,，]/).map(s => s.trim());
      const prices = (row[3] || '').split(/[,，]/).map(s => parseFloat(s.replace(/[^\d.-]/g, '')) || 0);
      const images = (row[4] || '').split(/[,，]/).map(s => s.trim());
      const description = (row[5] || '').trim();

      // 新增 G~L 欄位讀取
      const weight = (row[6] || '').trim();
      const material = (row[7] || '').trim();
      const dimensions = (row[8] || '').trim();
      const factoryLocation = (row[9] || '').trim();
      const factoryInfo = (row[10] || '').trim();
      const shippingMethod = (row[11] || '').trim();

      const mainId = skuIds[0] || `P-${Math.random().toString(36).substr(2, 5)}`;

      const variants = specs.map((specName, index) => ({
        skuId: skuIds[index] || `${mainId}-${index}`,
        specName: specName,
        price: prices[index] !== undefined ? prices[index] : (prices[0] || 0),
        image: images[index] || images[0] || 'https://via.placeholder.com/150'
      }));

      const minPrice = variants.length > 0 ? Math.min(...variants.map(v => v.price)) : 0;

      products[mainId] = {
        id: mainId,
        name: name,
        description: description,
        weight: weight,
        material: material,
        dimensions: dimensions,
        factoryLocation: factoryLocation,
        factoryInfo: factoryInfo,
        shippingMethod: shippingMethod,
        minPrice: minPrice,
        variants: variants
      };
    });

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
}