import { serviceError, UserFacingError } from '../errors';
import { supabase } from '../supabase';
import type { Snapshot } from '../types';
import { RECIPE_SELECT, recipeFromRow, recipeToPayload, type RecipeRow } from './rows';
import type { Repo } from './types';

function check<T>(res: { data: T; error: { message: string; code?: string } | null; status?: number }): NonNullable<T> {
  if (res.error) throw serviceError({ ...res.error, status: res.status });
  return (res.data ?? []) as NonNullable<T>;
}

/** Dados do usuário logado, no Supabase (protegidos por RLS). */
export class RemoteRepo implements Repo {
  constructor(private userId: string) {}

  async loadAll(): Promise<Snapshot> {
    const uid = this.userId;
    const [recipes, plans] = await Promise.all([
      supabase.from('recipes').select(RECIPE_SELECT).eq('user_id', uid).order('name'),
      supabase.from('meal_plans').select('id, date, recipe_id').eq('user_id', uid).order('created_at'),
    ]);

    return {
      recipes: (check(recipes) as unknown as RecipeRow[]).map(recipeFromRow),
      mealPlans: check(plans).map((p) => ({ id: p.id, date: p.date, recipeId: p.recipe_id })),
    };
  }

  async saveRecipe(recipe: Parameters<Repo['saveRecipe']>[0]) {
    check(await supabase.rpc('save_recipe', { p: recipeToPayload(recipe) }));
  }

  async deleteRecipe(id: string) {
    const res = await supabase.from('recipes').delete().eq('id', id);
    if (res.error?.code === '23503') throw new UserFacingError('Este preparo é usado em outra receita. Remova-o de lá primeiro.', 'Não é possível excluir', 'conflict');
    check(res);
  }

  async addMealPlan(plan: Parameters<Repo['addMealPlan']>[0]) {
    check(
      await supabase
        .from('meal_plans')
        .upsert({ id: plan.id, user_id: this.userId, date: plan.date, recipe_id: plan.recipeId }, { ignoreDuplicates: true }),
    );
  }

  async removeMealPlan(id: string) {
    check(await supabase.from('meal_plans').delete().eq('id', id));
  }
}
