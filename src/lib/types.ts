export type Ingredient = {
  id: string;
  name: string;
  unit: string | null;
  /** true = criado pelo usuário; false = catálogo global. */
  custom: boolean;
};

/** Um item é um ingrediente OU uma subreceita. */
export type RecipeItem = {
  id: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number | null;
  unit: string | null;
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  preparation: string | null;
  /** Link do vídeo/receita original (YouTube, Instagram, TikTok...). */
  sourceUrl: string | null;
  sourcePlatform: string | null;
  isPublic: boolean;
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

/** Todos os dados do usuário (no celular ou na conta). */
export type Snapshot = {
  customIngredients: Ingredient[];
  recipes: Recipe[];
  pantryIngredientIds: string[];
  pantryRecipeIds: string[];
  mealPlans: MealPlan[];
  extras: ShoppingExtra[];
};

export const emptySnapshot = (): Snapshot => ({
  customIngredients: [],
  recipes: [],
  pantryIngredientIds: [],
  pantryRecipeIds: [],
  mealPlans: [],
  extras: [],
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
  name: string;
  description: string | null;
  authorName: string | null;
  itemCount: number;
};
