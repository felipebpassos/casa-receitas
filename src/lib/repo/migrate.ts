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
  const recipes = withoutEmpty(local.recipes);
  const kept = new Set(recipes.map((r) => r.id));

  // Receitas: subreceitas antes de quem as usa. Sem login, tudo é privado.
  for (const recipe of dependencyOrder(recipes)) await remote.saveRecipe({ ...recipe, status: 'PRIVATE' });

  for (const plan of local.mealPlans) if (kept.has(plan.recipeId)) await remote.addMealPlan(plan);
  for (const extra of local.extras) await remote.addExtra(extra);
  await remote.setChecks(local.checks.filter((c) => kept.has(c.recipeId)), true);

  await localRepo.clear();
  return true;
}

/**
 * Tira receitas que ficaram sem itens (ex.: só tinham ingredientes personalizados
 * de versões antigas, que não existem no catálogo) e as referências a elas.
 */
function withoutEmpty(recipes: Recipe[]): Recipe[] {
  let list = recipes;
  for (;;) {
    const ids = new Set(list.map((r) => r.id));
    const next = list
      .map((r) => ({ ...r, items: r.items.filter((i) => !i.subRecipeId || ids.has(i.subRecipeId)) }))
      .filter((r) => r.items.length > 0);
    if (next.length === list.length && next.every((r, i) => r.items.length === list[i].items.length)) return next;
    list = next;
  }
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
