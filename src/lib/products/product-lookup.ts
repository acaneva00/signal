import { createClient } from '@supabase/supabase-js';
import type { FeeStructure } from './fee-calculator';

export interface ProductRow {
  id?: string;
  product_type: 'super_fund' | 'wrap_platform';
  name: string;
  aliases: string[];
  provider: string;
  fee_structure: FeeStructure;
  investment_options: unknown[];
  data_as_at: string;
}

const SENTINEL_NAMES = new Set(['the market', 'industry average', 'average fund']);

const INDUSTRY_BENCHMARK: ProductRow = {
  product_type: 'super_fund',
  name: 'Industry Average',
  aliases: [...SENTINEL_NAMES],
  provider: 'Benchmark',
  fee_structure: {
    admin_fee_pa: 78,
    admin_fee_pct: 0.85,
  },
  investment_options: [],
  data_as_at: new Date().toISOString().split('T')[0],
};

const SIMILARITY_THRESHOLD = 0.3;

function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase()} `;
  const result = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function findProduct(nameOrAlias: string): Promise<ProductRow | null> {
  const lower = nameOrAlias.toLowerCase().trim();

  if (SENTINEL_NAMES.has(lower)) {
    return INDUSTRY_BENCHMARK;
  }

  const supabase = getSupabaseClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('*');

  if (error || !products?.length) return null;

  const exact = products.find(
    (p) => p.name.toLowerCase() === lower,
  );
  if (exact) return exact as unknown as ProductRow;

  const aliasMatch = products.find((p) =>
    (p.aliases as string[])?.some((a) => a.toLowerCase() === lower),
  );
  if (aliasMatch) return aliasMatch as unknown as ProductRow;

  let bestMatch: ProductRow | null = null;
  let bestSim = 0;

  for (const p of products) {
    const nameSim = trigramSimilarity(lower, p.name);
    if (nameSim > bestSim) {
      bestSim = nameSim;
      bestMatch = p as unknown as ProductRow;
    }
    for (const alias of (p.aliases as string[]) ?? []) {
      const aliasSim = trigramSimilarity(lower, alias);
      if (aliasSim > bestSim) {
        bestSim = aliasSim;
        bestMatch = p as unknown as ProductRow;
      }
    }
  }

  return bestSim >= SIMILARITY_THRESHOLD ? bestMatch : null;
}
