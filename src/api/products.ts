export default async function handler(_req: any, res: any) {
  res.status(200).json({ message: 'Products API endpoint ready' });
}