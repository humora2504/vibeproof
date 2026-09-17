import { admin } from '@/lib/admin';
export async function POST(req: Request) {
  const { id } = await req.json();
  await admin.from('invoices').delete().eq('id', id);
  return Response.json({ ok: true });
}
