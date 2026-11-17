// Regras de "o que comprar" — funções puras, sem dependências (testadas com node --test).
import type { RecipeKind } from './types';

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

/** Quantidades exibidas como fração (0,5 → "1/2"). */
const FRACTIONS: Record<number, string> = { 0.5: '1/2', 0.25: '1/4' };

/** 1500 g → "1,5 kg"; 2000 ml → "2 l"; 0,5 → "1/2"; quantidade nula → "" (ou "a gosto"). */
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
  const num = FRACTIONS[q] ?? (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
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
 * Normalização para buscas: além de acentos e maiúsculas, ignora hífens e espaços
 * repetidos ("pimenta da" encontra "Pimenta-da-jamaica"). Mesma regra de public.normalize_search.
 */
export function normalizeSearch(value: string): string {
  return normalizeName(value)
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// ------------------------------------------------------------ lista de compras (só no celular)

/** Item avulso da lista (detergente etc.). */
export type ListExtra = { id: string; name: string; quantity: number | null; unit: string | null; checked: boolean };

/** Estado da lista de uma semana. Riscos: `${recipeId}|${item.key}`. */
export type WeekList = { checked: string[]; extras: ListExtra[] };

/** Listas salvas no celular, por início da semana. */
export type ListStore = Record<string, WeekList>;

export const emptyWeekList = (): WeekList => ({ checked: [], extras: [] });

export const listCheckKey = (group: NeedGroup, item: NeedItem) => `${group.recipeId}|${item.key}`;

/** Descarta as listas de semanas que já passaram. */
export function pruneWeeks(store: ListStore, currentWeekStart: string): ListStore {
  return Object.fromEntries(Object.entries(store).filter(([week]) => week >= currentWeekStart));
}

/** Texto para compartilhar (WhatsApp etc.): só o que ainda não foi riscado. Vazio se não falta nada. */
export function shoppingListText(title: string, groups: NeedGroup[], list: WeekList): string {
  const checked = new Set(list.checked);
  const line = (name: string, quantity: number | null, unit: string | null) => {
    const qty = formatQuantity(quantity, unit);
    return `• ${name}${qty ? ` ${qty}` : ''}`;
  };

  const sections: string[] = [];
  for (const g of groups) {
    const pending = g.items.filter((i) => !checked.has(listCheckKey(g, i)));
    if (pending.length) sections.push([g.name, ...pending.map((i) => line(i.name, i.quantity, i.unit))].join('\n'));
  }
  const extras = list.extras.filter((e) => !e.checked);
  if (extras.length) sections.push(['Outros itens', ...extras.map((e) => line(e.name, e.quantity, e.unit))].join('\n'));

  return sections.length ? [title, ...sections].join('\n\n') : '';
}

/** Quantos itens há na lista agrupada. */
export const countItems = (groups: NeedGroup[]) => groups.reduce((n, g) => n + g.items.length, 0);

/** A receita usa algum preparo como ingrediente? */
export const hasSubRecipes = (recipe: RecipeLike) => recipe.items.some((i) => i.subRecipeId);

/**
 * Preparos que podem ser usados como ingrediente de `currentId`.
 * Só preparos viram ingrediente, e preparos não usam outros preparos (um nível, sem ciclos).
 */
export function allowedSubRecipes<R extends RecipeLike & { kind: RecipeKind }>(recipes: R[], currentId: string): R[] {
  return recipes.filter((r) => r.kind === 'PREP' && r.id !== currentId && !hasSubRecipes(r));
}

/**
 * Tipo de receitas salvas antes de existir Receita/Preparo:
 * quem já é usado como ingrediente por outra (e não usa nenhuma) vira preparo.
 */
export function inferKind(recipe: RecipeLike, all: RecipeLike[]): RecipeKind {
  const usedByOthers = all.some((r) => r.id !== recipe.id && r.items.some((i) => i.subRecipeId === recipe.id));
  return usedByOthers && !hasSubRecipes(recipe) ? 'PREP' : 'RECIPE';
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
