import { createServerClient } from '@/lib/supabase-server';
export async function POST(req: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { title } = await req.json();
  await supabase.from('items').insert({ title, user_id: user.id });
  return Response.json({ ok: true });
}
