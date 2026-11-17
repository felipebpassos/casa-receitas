import AsyncStorage from '@react-native-async-storage/async-storage';
import { GLOBAL_CATALOG } from '../catalog';
import { inferKind, normalizeName } from '../shopping';
import { emptySnapshot, type Recipe, type Snapshot } from '../types';
import type { Repo } from './types';

const KEY = 'receitas-de-casa:data:v1';

/** Formato antigo (com Despensa, lista de compras salva, ingredientes personalizados, isPublic e sem tipo Receita/Preparo). */
type LegacyData = Omit<Partial<Snapshot>, 'recipes'> & {
  customIngredients?: { id: string; name: string }[];
  recipes?: (Omit<Recipe, 'visibility' | 'listed' | 'kind'> &
    Partial<Pick<Recipe, 'visibility' | 'listed' | 'kind'>> & { isPublic?: boolean; status?: string; rejectionReason?: string | null })[];
};

/**
 * Converte dados salvos por versões antigas: ingredientes personalizados viram o do
 * catálogo de mesmo nome (sem correspondente, o item sai da receita); a Despensa é descartada.
 */
function normalize(raw: LegacyData): Snapshot {
  const catalogByName = new Map(GLOBAL_CATALOG.map((i) => [normalizeName(i.name), i.id]));
  const customMap = new Map((raw.customIngredients ?? []).map((i) => [i.id, catalogByName.get(normalizeName(i.name)) ?? null]));

  const rawRecipes = raw.recipes ?? [];
  const recipes: Recipe[] = rawRecipes.map(({ isPublic: _legacy, status: _status, rejectionReason: _reason, ...r }) => ({
    ...r,
    kind: r.kind ?? inferKind(r, rawRecipes),
    // Sem login nada é público.
    visibility: 'PRIVATE',
    listed: false,
    items: r.items.flatMap((i) => {
      if (!i.ingredientId || !customMap.has(i.ingredientId)) return [i];
      const id = customMap.get(i.ingredientId);
      return id ? [{ ...i, ingredientId: id }] : [];
    }),
  }));

  return { ...emptySnapshot(), mealPlans: raw.mealPlans ?? [], recipes };
}

/** Dados do usuário sem login: um único JSON no AsyncStorage. */
class LocalRepo implements Repo {
  private cache: Snapshot | null = null;

  private async data(): Promise<Snapshot> {
    if (!this.cache) {
      const raw = await AsyncStorage.getItem(KEY);
      this.cache = raw ? normalize(JSON.parse(raw) as LegacyData) : emptySnapshot();
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
    return d.recipes.length === 0 && d.mealPlans.length === 0;
  }

  async clear() {
    this.cache = emptySnapshot();
    await AsyncStorage.removeItem(KEY);
  }

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
    });

  addMealPlan: Repo['addMealPlan'] = (plan) =>
    this.update((d) => {
      d.mealPlans.push(plan);
    });

  removeMealPlan: Repo['removeMealPlan'] = (id) =>
    this.update((d) => {
      d.mealPlans = d.mealPlans.filter((p) => p.id !== id);
    });
}

export const localRepo = new LocalRepo();
