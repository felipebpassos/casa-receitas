/** Ingrediente do catálogo global (o mesmo para todos; ninguém cria ingrediente pelo app). */
export type Ingredient = {
  id: string;
  name: string;
  unit: string | null;
  /** Unidades aceitas na receita; null = todas. */
  allowedUnits: string[] | null;
};

/** Um item é um ingrediente OU uma subreceita. */
export type RecipeItem = {
  id: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number | null;
  unit: string | null;
};

/**
 * PRIVATE: só para você. PENDING: enviada para a biblioteca, aguardando moderação.
 * APPROVED: aparece na biblioteca. REJECTED: recusada (veja rejectionReason).
 */
export type RecipeStatus = 'PRIVATE' | 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * RECIPE: prato completo (lasanha, pizza); pode usar preparos como ingrediente.
 * PREP: preparo, base usada dentro de receitas (arroz, molho de tomate); só ingredientes do catálogo.
 * Escolhido ao criar; não muda depois.
 */
export type RecipeKind = 'RECIPE' | 'PREP';

export type Recipe = {
  id: string;
  kind: RecipeKind;
  name: string;
  description: string | null;
  preparation: string | null;
  /** Link do vídeo/receita original (YouTube, Instagram, TikTok...). */
  sourceUrl: string | null;
  sourcePlatform: string | null;
  status: RecipeStatus;
  rejectionReason: string | null;
  /** Preenchidos quando é uma cópia salva da receita pública de outra pessoa. */
  originRecipeId: string | null;
  originAuthorName: string | null;
  createdAt: string;
  updatedAt: string;
  items: RecipeItem[];
};

export type MealPlan = {
  id: string;
  date: string;
  recipeId: string;
};

export type ShoppingExtra = {
  id: string;
  weekStart: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  purchased: boolean;
};

/** Item riscado na lista de compras da semana (no grupo da receita/subpreparo `recipeId`). */
export type ShoppingCheck = {
  weekStart: string;
  recipeId: string;
  ingredientId: string;
  /** Unidade normalizada (kg→g, l→ml); '' quando não há. */
  unit: string;
};

export const checkKey = (c: ShoppingCheck) => `${c.weekStart}|${c.recipeId}|${c.ingredientId}|${c.unit}`;

/** Todos os dados do usuário (no celular ou na conta). */
export type Snapshot = {
  recipes: Recipe[];
  mealPlans: MealPlan[];
  extras: ShoppingExtra[];
  checks: ShoppingCheck[];
};

export const emptySnapshot = (): Snapshot => ({
  recipes: [],
  mealPlans: [],
  extras: [],
  checks: [],
});

/** Receita pública de outra pessoa, com as subreceitas e nomes de ingredientes necessários. */
export type PublicRecipeTree = {
  root: Recipe;
  authorName: string | null;
  authorId: string;
  /** Subreceitas (todos os níveis), por id. */
  subs: Record<string, Recipe>;
  /** Nome de cada ingrediente usado na árvore, por id. */
  ingredientNames: Record<string, string>;
};

export type PublicRecipeSummary = {
  id: string;
  userId: string;
  kind: RecipeKind;
  name: string;
  description: string | null;
  authorName: string | null;
  itemCount: number;
};
