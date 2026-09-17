import { admin } from '@/lib/admin';

// Reachable by anyone with the URL. Nothing here asks who is calling.
export async function DELETE(req: Request) {
  const { id } = await req.json();
  await admin.from('orders').delete().eq('id', id);
  return Response.json({ ok: true });
}
