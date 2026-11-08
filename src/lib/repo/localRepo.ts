import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptySnapshot, type Snapshot } from '../types';
import type { Repo } from './types';

const KEY = 'receitas-de-casa:data:v1';

/** Dados do usuário sem login: um único JSON no AsyncStorage. */
class LocalRepo implements Repo {
  private cache: Snapshot | null = null;

  private async data(): Promise<Snapshot> {
    if (!this.cache) {
      const raw = await AsyncStorage.getItem(KEY);
      this.cache = raw ? { ...emptySnapshot(), ...(JSON.parse(raw) as Partial<Snapshot>) } : emptySnapshot();
    }
    return this.cache;
  }

  private async update(mutate: (d: Snapshot) => void) {
    const d = await this.data();
    mutate(d);
    await AsyncStorage.setItem(KEY, JSON.stringify(d));
  }

  async loadAll() {
    return JSON.parse(JSON.stringify(await this.data())) as Snapshot;
  }

  async isEmpty() {
    const d = await this.data();
    return (
      d.recipes.length === 0 &&
      d.customIngredients.length === 0 &&
      d.pantryIngredientIds.length === 0 &&
      d.pantryRecipeIds.length === 0 &&
      d.mealPlans.length === 0 &&
      d.extras.length === 0
    );
  }

  async clear() {
    this.cache = emptySnapshot();
    await AsyncStorage.removeItem(KEY);
  }

  createIngredient: Repo['createIngredient'] = (ingredient) =>
    this.update((d) => {
      d.customIngredients.push(ingredient);
    });

  saveRecipe: Repo['saveRecipe'] = (recipe) =>
    this.update((d) => {
      const idx = d.recipes.findIndex((r) => r.id === recipe.id);
      if (idx >= 0) d.recipes[idx] = recipe;
      else d.recipes.push(recipe);
    });

  deleteRecipe: Repo['deleteRecipe'] = (id) =>
    this.update((d) => {
      d.recipes = d.recipes.filter((r) => r.id !== id);
      d.mealPlans = d.mealPlans.filter((p) => p.recipeId !== id);
      d.pantryRecipeIds = d.pantryRecipeIds.filter((r) => r !== id);
    });

  setPantryIngredient: Repo['setPantryIngredient'] = (id, has) =>
    this.update((d) => {
      d.pantryIngredientIds = d.pantryIngredientIds.filter((i) => i !== id);
      if (has) d.pantryIngredientIds.push(id);
    });

  setPantryRecipe: Repo['setPantryRecipe'] = (id, has) =>
    this.update((d) => {
      d.pantryRecipeIds = d.pantryRecipeIds.filter((i) => i !== id);
      if (has) d.pantryRecipeIds.push(id);
    });

  addMealPlan: Repo['addMealPlan'] = (plan) =>
    this.update((d) => {
      d.mealPlans.push(plan);
    });

  removeMealPlan: Repo['removeMealPlan'] = (id) =>
    this.update((d) => {
      d.mealPlans = d.mealPlans.filter((p) => p.id !== id);
    });

  addExtra: Repo['addExtra'] = (extra) =>
    this.update((d) => {
      d.extras.push(extra);
    });

  updateExtra: Repo['updateExtra'] = (id, patch) =>
    this.update((d) => {
      d.extras = d.extras.map((e) => (e.id === id ? { ...e, ...patch } : e));
    });

  deleteExtra: Repo['deleteExtra'] = (id) =>
    this.update((d) => {
      d.extras = d.extras.filter((e) => e.id !== id);
    });
}

export const localRepo = new LocalRepo();
