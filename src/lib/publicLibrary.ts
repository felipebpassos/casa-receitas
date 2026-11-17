// Receitas de outras pessoas: sempre lidas do Supabase (funciona com ou sem login).
// Receita listada com edição aguardando aprovação aparece como a versão aprovada (snapshot).
import { RECIPE_SELECT, recipeFromRow, type RecipeRow } from './repo/rows';
import { serviceError } from './errors';
import { supabase } from './supabase';
import type { PublicRecipeSummary, PublicRecipeTree, Recipe } from './types';

type SummaryRow = { id: string; user_id: string; kind: string | null; name: string; description: string | null; author_name: string | null; item_count: number };

const toSummary = (r: SummaryRow): PublicRecipeSummary => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind === 'PREP' ? 'PREP' : 'RECIPE',
  name: r.name,
  description: r.description,
  authorName: r.author_name,
  itemCount: Number(r.item_count),
});

export const EXPLORE_PAGE_SIZE = 20;

export type PublicRecipePage = {
  items: PublicRecipeSummary[];
  /** Resultados da busca, em todas as páginas (sem as já salvas). */
  total: number;
  /** O mesmo, contando as já salvas. */
  matched: number;
};

/**
 * Busca do Explorar: só as receitas que a equipe destacou, uma página por vez.
 * As da pessoa logada e as já salvas (`excludeIds`) ficam de fora e não contam no total.
 */
export async function searchPublicRecipes(
  q: string,
  opts: { kind?: 'RECIPE' | 'PREP' | null; excludeIds?: string[]; offset?: number; limit?: number } = {},
): Promise<PublicRecipePage> {
  const { data, error, status } = await supabase.rpc('search_public_recipes', {
    q,
    p_kind: opts.kind ?? null,
    p_exclude: opts.excludeIds ?? [],
    p_limit: opts.limit ?? EXPLORE_PAGE_SIZE,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw serviceError({ ...error, status });
  const rows = data as (SummaryRow & { total_count: number; matched_count: number })[];
  if (rows.length) return { items: rows.map(toSummary), total: Number(rows[0].total_count), matched: Number(rows[0].matched_count) };

  // Primeira página vazia: descobre se é porque tudo já foi salvo.
  let matched = 0;
  if (!opts.offset && opts.excludeIds?.length) {
    const all = await supabase.rpc('search_public_recipes', { q, p_kind: opts.kind ?? null, p_limit: 1 });
    if (!all.error) matched = Number((all.data as { matched_count: number }[])[0]?.matched_count ?? 0);
  }
  return { items: [], total: 0, matched };
}

export type PublicPersonSummary = { id: string; name: string | null; recipeCount: number };

/** Explorar > Usuários: só pelo nome de usuário exato. */
export async function searchPublicProfiles(q: string, excludeUserId: string | null): Promise<PublicPersonSummary[]> {
  const { data, error, status } = await supabase.rpc('search_public_profiles', { q });
  if (error) throw serviceError({ ...error, status });
  return (data as { id: string; username: string | null; recipe_count: number }[])
    .filter((p) => p.id !== excludeUserId)
    .map((p) => ({ id: p.id, name: p.username, recipeCount: Number(p.recipe_count) }));
}

export type PublicProfile = { id: string; name: string | null; recipes: PublicRecipeSummary[] };

/** Perfil público: usuário e todas as receitas e preparos públicos da pessoa. */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const [profile, list] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
    supabase.rpc('list_user_public_recipes', { p_user: userId }),
  ]);
  if (profile.error) throw serviceError({ ...profile.error, status: profile.status });
  if (list.error) throw serviceError({ ...list.error, status: list.status });
  if (!profile.data) return null;
  return { id: userId, name: profile.data.username ?? null, recipes: (list.data as SummaryRow[]).map(toSummary) };
}

/**
 * Autor da receita original de uma cópia salva (id e usuário atual), para o link "Criado por".
 * null se a original não estiver mais acessível (excluída ou deixou de ser pública).
 */
export async function getOriginAuthor(originRecipeId: string): Promise<{ id: string; username: string | null } | null> {
  const rec = await supabase.from('recipes').select('user_id').eq('id', originRecipeId).maybeSingle();
  if (rec.error) throw serviceError({ ...rec.error, status: rec.status });
  if (!rec.data) return null;
  const prof = await supabase.from('profiles').select('username').eq('id', rec.data.user_id).maybeSingle();
  return { id: rec.data.user_id, username: prof.data?.username ?? null };
}

/** Papel de admin da pessoa logada (false se não der para ler). */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  return !error && !!data?.is_admin;
}

/** Troca as linhas que têm edição pendente pela versão aprovada. */
async function withApprovedVersions(rows: RecipeRow[]): Promise<RecipeRow[]> {
  if (!rows.length) return rows;
  const res = await supabase
    .from('recipe_pending_edits')
    .select('recipe_id, snapshot')
    .in('recipe_id', rows.map((r) => r.id));
  if (res.error) throw serviceError({ ...res.error, status: res.status });
  const snapshots = new Map((res.data as { recipe_id: string; snapshot: RecipeRow }[]).map((e) => [e.recipe_id, e.snapshot]));
  return rows.map((r) => snapshots.get(r.id) ?? r);
}

/** Busca a receita pública com todas as subreceitas e os nomes dos ingredientes usados. */
export async function getPublicRecipeTree(id: string): Promise<PublicRecipeTree | null> {
  const rootRes = await supabase.from('recipes').select(RECIPE_SELECT).eq('id', id).eq('visibility', 'PUBLIC').maybeSingle();
  if (rootRes.error) throw serviceError({ ...rootRes.error, status: rootRes.status });
  if (!rootRes.data) return null;
  const [rootRow] = await withApprovedVersions([rootRes.data as unknown as RecipeRow]);
  const root = recipeFromRow(rootRow);

  // Subreceitas, nível a nível.
  const subs: Record<string, Recipe> = {};
  let pending = subIdsOf(root).filter((s) => s !== root.id);
  while (pending.length) {
    const res = await supabase.from('recipes').select(RECIPE_SELECT).in('id', pending);
    if (res.error) throw serviceError({ ...res.error, status: res.status });
    pending = [];
    for (const row of await withApprovedVersions(res.data as unknown as RecipeRow[])) {
      const r = recipeFromRow(row);
      subs[r.id] = r;
      for (const s of subIdsOf(r)) if (s !== root.id && !subs[s] && !pending.includes(s)) pending.push(s);
    }
  }

  const ingredientIds = [...new Set([root, ...Object.values(subs)].flatMap((r) => r.items.map((i) => i.ingredientId).filter((x): x is string => !!x)))];
  const ingredientNames: Record<string, string> = {};
  if (ingredientIds.length) {
    const res = await supabase.from('ingredients').select('id, name').in('id', ingredientIds);
    if (res.error) throw serviceError({ ...res.error, status: res.status });
    for (const i of res.data) ingredientNames[i.id] = i.name;
  }

  const profile = await supabase.from('profiles').select('username').eq('id', rootRow.user_id).maybeSingle();

  return { root, subs, ingredientNames, authorId: rootRow.user_id, authorName: profile.data?.username ?? null };
}

function subIdsOf(r: Recipe): string[] {
  return r.items.map((i) => i.subRecipeId).filter((x): x is string => !!x);
}
