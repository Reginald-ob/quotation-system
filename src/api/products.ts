// api/products.ts
export default async function handler(req: any, res: any) {
  // 預留 Google Sheets API 實作位置
  res.status(200).json({ message: 'Products API endpoint ready' });
}