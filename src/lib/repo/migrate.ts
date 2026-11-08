import { normalizeName } from '../shopping';
import type { Recipe } from '../types';
import { localRepo } from './localRepo';
import type { RemoteRepo } from './remoteRepo';

/**
 * No primeiro login, envia para a conta tudo o que estava salvo só no celular
 * e depois limpa os dados locais. É idempotente: se falhar no meio, pode ser
 * repetida sem duplicar nada (os IDs são preservados).
 */
export async function migrateLocalToRemote(remote: RemoteRepo): Promise<boolean> {
  if (await localRepo.isEmpty()) return false;

  const local = await localRepo.loadAll();
  const existing = await remote.loadAll();

  // Ingredientes personalizados: reaproveita os que já existem na conta (mesmo nome).
  const ingredientMap = new Map<string, string>();
  for (const ing of local.customIngredients) {
    const same = existing.customIngredients.find((e) => normalizeName(e.name) === normalizeName(ing.name));
    if (same) {
      ingredientMap.set(ing.id, same.id);
    } else {
      await remote.createIngredient(ing);
      ingredientMap.set(ing.id, ing.id);
    }
  }
  const mapIng = (id: string) => ingredientMap.get(id) ?? id;

  // Receitas: subreceitas antes de quem as usa.
  for (const recipe of dependencyOrder(local.recipes)) {
    await remote.saveRecipe({
      ...recipe,
      isPublic: false,
      items: recipe.items.map((i) => ({ ...i, ingredientId: i.ingredientId ? mapIng(i.ingredientId) : null })),
    });
  }

  for (const id of local.pantryIngredientIds) await remote.setPantryIngredient(mapIng(id), true);
  for (const id of local.pantryRecipeIds) await remote.setPantryRecipe(id, true);
  for (const plan of local.mealPlans) await remote.addMealPlan(plan);
  for (const extra of local.extras) await remote.addExtra(extra);

  await localRepo.clear();
  return true;
}

/** Ordena as receitas de forma que toda subreceita venha antes da receita que a usa. */
export function dependencyOrder(recipes: Recipe[]): Recipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const done = new Set<string>();
  const result: Recipe[] = [];
  const visit = (r: Recipe, path: Set<string>) => {
    if (done.has(r.id) || path.has(r.id)) return;
    path.add(r.id);
    for (const item of r.items) {
      const sub = item.subRecipeId ? byId.get(item.subRecipeId) : undefined;
      if (sub) visit(sub, path);
    }
    done.add(r.id);
    result.push(r);
  };
  for (const r of recipes) visit(r, new Set());
  return result;
}
