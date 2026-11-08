import type { Ingredient, MealPlan, Recipe, ShoppingExtra, Snapshot } from '../types';

/**
 * Onde os dados do usuário moram. Duas implementações:
 * - LocalRepo: no celular (usuário sem login)
 * - RemoteRepo: no Supabase (usuário logado)
 * As telas não sabem qual está em uso.
 */
export interface Repo {
  loadAll(): Promise<Snapshot>;
  createIngredient(ingredient: Ingredient): Promise<void>;
  saveRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  setPantryIngredient(ingredientId: string, has: boolean): Promise<void>;
  setPantryRecipe(recipeId: string, has: boolean): Promise<void>;
  addMealPlan(plan: MealPlan): Promise<void>;
  removeMealPlan(id: string): Promise<void>;
  addExtra(extra: ShoppingExtra): Promise<void>;
  updateExtra(id: string, patch: Partial<Pick<ShoppingExtra, 'purchased'>>): Promise<void>;
  deleteExtra(id: string): Promise<void>;
}
