// Biblioteca pública: sempre lida do Supabase (funciona com ou sem login).
import { RECIPE_SELECT, recipeFromRow, type RecipeRow } from './repo/rows';
import { supabase } from './supabase';
import type { PublicRecipeSummary, PublicRecipeTree, Recipe } from './types';

export async function searchPublicRecipes(q: string, excludeUserId: string | null): Promise<PublicRecipeSummary[]> {
  const { data, error } = await supabase.rpc('search_public_recipes', { q });
  if (error) throw new Error(error.message);
  return (data as { id: string; user_id: string; name: string; description: string | null; author_name: string | null; item_count: number }[])
    .filter((r) => r.user_id !== excludeUserId)
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description,
      authorName: r.author_name,
      itemCount: Number(r.item_count),
    }));
}

/** Busca a receita pública com todas as subreceitas e os nomes dos ingredientes usados. */
export async function getPublicRecipeTree(id: string): Promise<PublicRecipeTree | null> {
  const rootRes = await supabase.from('recipes').select(RECIPE_SELECT).eq('id', id).eq('is_public', true).maybeSingle();
  if (rootRes.error) throw new Error(rootRes.error.message);
  if (!rootRes.data) return null;
  const rootRow = rootRes.data as unknown as RecipeRow;
  const root = recipeFromRow(rootRow);

  // Subreceitas, nível a nível.
  const subs: Record<string, Recipe> = {};
  let pending = subIdsOf(root).filter((s) => s !== root.id);
  while (pending.length) {
    const res = await supabase.from('recipes').select(RECIPE_SELECT).in('id', pending);
    if (res.error) throw new Error(res.error.message);
    pending = [];
    for (const row of res.data as unknown as RecipeRow[]) {
      const r = recipeFromRow(row);
      subs[r.id] = r;
      for (const s of subIdsOf(r)) if (s !== root.id && !subs[s] && !pending.includes(s)) pending.push(s);
    }
  }

  const ingredientIds = [...new Set([root, ...Object.values(subs)].flatMap((r) => r.items.map((i) => i.ingredientId).filter((x): x is string => !!x)))];
  const ingredientNames: Record<string, string> = {};
  if (ingredientIds.length) {
    const res = await supabase.from('ingredients').select('id, name').in('id', ingredientIds);
    if (res.error) throw new Error(res.error.message);
    for (const i of res.data) ingredientNames[i.id] = i.name;
  }

  const profile = await supabase.from('profiles').select('display_name').eq('id', rootRow.user_id).maybeSingle();

  return { root, subs, ingredientNames, authorId: rootRow.user_id, authorName: profile.data?.display_name ?? null };
}

function subIdsOf(r: Recipe): string[] {
  return r.items.map((i) => i.subRecipeId).filter((x): x is string => !!x);
}
