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
};

export type NeedItem = {
  /** `${ingredientId}|${unit}` — único dentro do grupo. */
  key: string;
  ingredientId: string;
  name: string;
  quantity: number | null;
  /** Unidade normalizada (kg→g, l→ml); '' quando não há. */
  unit: string;
};

/** Ingredientes de uma receita (ou subpreparo) na lista de compras. */
export type NeedGroup = {
  recipeId: string;
  name: string;
  /** Só aparece como parte de outra receita (não foi planejada diretamente). */
  isSub: boolean;
  /** Receitas que usam esta como subpreparo. */
  usedBy: string[];
  items: NeedItem[];
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
 * Lista de compras agrupada por preparo, para as receitas informadas
 * (a mesma receita pode aparecer mais de uma vez — ex.: planejada em dois dias).
 *
 * - Cada receita e cada subreceita (em qualquer nível) é um grupo próprio:
 *   ingredientes de grupos diferentes NUNCA são somados, para que dê para riscar
 *   o subpreparo que você já tem pronto sem mexer no resto.
 * - Receita usada N vezes (planejada ou como subpreparo) entra N vezes no seu grupo.
 * - Dentro do grupo, mesmo ingrediente + unidade compatível são somados.
 * - Ordem: cada receita seguida dos seus subpreparos. Ciclos são ignorados com segurança.
 */
export function computeGroups(recipeIds: string[], ctx: NeedsContext): NeedGroup[] {
  const groups = new Map<string, NeedGroup & { byKey: Map<string, NeedItem> }>();
  const planned = new Set(recipeIds);

  const expand = (recipe: RecipeLike, parent: RecipeLike | null, path: Set<string>) => {
    let group = groups.get(recipe.id);
    if (!group) {
      group = { recipeId: recipe.id, name: recipe.name, isSub: !planned.has(recipe.id), usedBy: [], items: [], byKey: new Map() };
      groups.set(recipe.id, group);
    }
    if (parent && !group.usedBy.includes(parent.name)) group.usedBy.push(parent.name);

    for (const item of recipe.items) {
      if (item.ingredientId) {
        const base = toBaseUnit(item.quantity, item.unit);
        const key = `${item.ingredientId}|${base.unit}`;
        const existing = group.byKey.get(key);
        if (existing) {
          if (base.quantity != null) existing.quantity = (existing.quantity ?? 0) + base.quantity;
        } else {
          group.byKey.set(key, {
            key,
            ingredientId: item.ingredientId,
            name: ctx.ingredientName(item.ingredientId),
            quantity: base.quantity,
            unit: base.unit,
          });
        }
      } else if (item.subRecipeId && !path.has(item.subRecipeId)) {
        const sub = ctx.getRecipe(item.subRecipeId);
        if (sub) expand(sub, recipe, new Set(path).add(sub.id));
      }
    }
  };

  for (const id of recipeIds) {
    const recipe = ctx.getRecipe(id);
    if (recipe) expand(recipe, null, new Set([recipe.id]));
  }

  return [...groups.values()]
    .map(({ byKey, ...g }) => ({ ...g, items: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))
    .filter((g) => g.items.length > 0);
}

/** Quantos itens há na lista agrupada. */
export const countItems = (groups: NeedGroup[]) => groups.reduce((n, g) => n + g.items.length, 0);

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
