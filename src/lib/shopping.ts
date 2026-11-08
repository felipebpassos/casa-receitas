// Regras de "o que comprar" — funções puras, sem dependências (testadas com node --test).

export const UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'unidade',
  'colher (sopa)',
  'colher (chá)',
  'xícara',
  'pacote',
  'lata',
  'caixa',
  'dente',
  'maço',
  'pitada',
  'a gosto',
] as const;

/** Formato mínimo de receita usado nos cálculos. */
export type RecipeLike = {
  id: string;
  name: string;
  items: {
    ingredientId: string | null;
    subRecipeId: string | null;
    quantity: number | null;
    unit: string | null;
  }[];
};

export type NeedsContext = {
  getRecipe: (id: string) => RecipeLike | undefined;
  ingredientName: (id: string) => string;
  hasIngredient: (id: string) => boolean;
  hasRecipe: (id: string) => boolean;
};

export type NeedItem = {
  key: string;
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string;
  /** Receitas (incluindo subreceitas) que pedem este ingrediente. */
  usedIn: string[];
};

// Única conversão feita: kg→g e l→ml. Unidades diferentes nunca são somadas.
const CONVERSIONS: Record<string, { base: string; factor: number }> = {
  kg: { base: 'g', factor: 1000 },
  l: { base: 'ml', factor: 1000 },
};

export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLowerCase();
}

export function toBaseUnit(quantity: number | null, unit: string | null): { quantity: number | null; unit: string } {
  const u = normalizeUnit(unit);
  const conv = CONVERSIONS[u];
  if (!conv) return { quantity, unit: u };
  return { quantity: quantity == null ? null : quantity * conv.factor, unit: conv.base };
}

/** 1500 g → "1,5 kg"; 2000 ml → "2 l"; quantidade nula → "" (ou "a gosto"). */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  const u = normalizeUnit(unit);
  if (quantity == null) return u === 'a gosto' ? 'a gosto' : '';
  let q = quantity;
  let shown = u;
  if (u === 'g' && q >= 1000) {
    q /= 1000;
    shown = 'kg';
  } else if (u === 'ml' && q >= 1000) {
    q /= 1000;
    shown = 'l';
  }
  const num = Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return shown ? `${num} ${shown}` : num;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Calcula o que precisa ser comprado para as receitas informadas
 * (a mesma receita pode aparecer mais de uma vez — ex.: planejada em dois dias).
 *
 * - Ingredientes que você tem em casa não entram.
 * - Subreceita que você tem pronta em casa não entra.
 * - Subreceita que você não tem: entram os ingredientes dela (receita inteira,
 *   uma vez por uso), em qualquer nível. Ciclos são ignorados com segurança.
 * - Mesmo ingrediente + unidade compatível são somados.
 */
export function computeNeeds(recipeIds: string[], ctx: NeedsContext): NeedItem[] {
  const byKey = new Map<string, NeedItem>();

  const expand = (recipe: RecipeLike, path: Set<string>) => {
    for (const item of recipe.items) {
      if (item.ingredientId) {
        if (ctx.hasIngredient(item.ingredientId)) continue;
        const base = toBaseUnit(item.quantity, item.unit);
        const key = `${item.ingredientId}|${base.unit}`;
        const existing = byKey.get(key);
        if (existing) {
          if (base.quantity != null) existing.quantity = (existing.quantity ?? 0) + base.quantity;
          if (!existing.usedIn.includes(recipe.name)) existing.usedIn.push(recipe.name);
        } else {
          byKey.set(key, {
            key,
            ingredientId: item.ingredientId,
            name: ctx.ingredientName(item.ingredientId),
            quantity: base.quantity,
            unit: base.unit,
            usedIn: [recipe.name],
          });
        }
      } else if (item.subRecipeId) {
        if (ctx.hasRecipe(item.subRecipeId) || path.has(item.subRecipeId)) continue;
        const sub = ctx.getRecipe(item.subRecipeId);
        if (sub) expand(sub, new Set(path).add(sub.id));
      }
    }
  };

  for (const id of recipeIds) {
    const recipe = ctx.getRecipe(id);
    if (recipe) expand(recipe, new Set([recipe.id]));
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** `recipeId` usa `targetId` como subreceita (direta ou indiretamente)? */
export function dependsOn(recipeId: string, targetId: string, getRecipe: (id: string) => RecipeLike | undefined): boolean {
  const seen = new Set<string>();
  const stack = [recipeId];
  while (stack.length) {
    const r = getRecipe(stack.pop()!);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    for (const item of r.items) {
      if (!item.subRecipeId) continue;
      if (item.subRecipeId === targetId) return true;
      stack.push(item.subRecipeId);
    }
  }
  return false;
}

/** Receitas que podem ser usadas como subreceita de `currentId` sem criar ciclo. */
export function allowedSubRecipes<R extends RecipeLike>(recipes: R[], currentId: string): R[] {
  const get = (id: string) => recipes.find((r) => r.id === id);
  return recipes.filter((r) => r.id !== currentId && !dependsOn(r.id, currentId, get));
}

/** IDs das receitas usadas como subreceita por alguma outra receita. */
export function subRecipeIds(recipes: RecipeLike[]): Set<string> {
  const ids = new Set<string>();
  for (const r of recipes) for (const item of r.items) if (item.subRecipeId) ids.add(item.subRecipeId);
  return ids;
}

/** Receitas que usam `id` diretamente como subreceita. */
export function parentsOf<R extends RecipeLike>(recipes: R[], id: string): R[] {
  return recipes.filter((r) => r.items.some((i) => i.subRecipeId === id));
}
