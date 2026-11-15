import type { MealPlan, Recipe, Snapshot } from '../types';

/**
 * Onde os dados do usuário moram. Duas implementações:
 * - LocalRepo: no celular (usuário sem login)
 * - RemoteRepo: no Supabase (usuário logado)
 * As telas não sabem qual está em uso.
 */
export interface Repo {
  loadAll(): Promise<Snapshot>;
  saveRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  addMealPlan(plan: MealPlan): Promise<void>;
  removeMealPlan(id: string): Promise<void>;
}
