import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, aliases');

  if (error || !products?.length) {
    return NextResponse.json([]);
  }

  const lower = q.toLowerCase();
  const matches = products
    .filter((p) => {
      if (p.name.toLowerCase().includes(lower)) return true;
      const aliases = (p.aliases as string[]) ?? [];
      return aliases.some((a) => a.toLowerCase().includes(lower));
    })
    .slice(0, 6)
    .map(({ id, name }) => ({ id, name }));

  return NextResponse.json(matches);
}
