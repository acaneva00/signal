import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface InvestmentOptionRow {
  name: string;
  investment_fee_pct?: number;
  total_fee_pct?: number;
}

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
  const fundName = (searchParams.get('fund') ?? '').trim();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();

  if (!fundName) {
    return NextResponse.json([]);
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('investment_options')
    .ilike('name', fundName)
    .limit(1);

  if (error || !products?.length) {
    return NextResponse.json([]);
  }

  const options = (products[0].investment_options ?? []) as InvestmentOptionRow[];

  const matches = options
    .filter((o) => !q || o.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map((o, i) => ({ id: `opt_${i}`, name: o.name }));

  return NextResponse.json(matches);
}
