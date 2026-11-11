import { serviceError, UserFacingError } from '../errors';
import { supabase } from '../supabase';
import type { ShoppingCheck, Snapshot } from '../types';
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
    const [recipes, plans, extras, checks] = await Promise.all([
      supabase.from('recipes').select(RECIPE_SELECT).eq('user_id', uid).order('name'),
      supabase.from('meal_plans').select('id, date, recipe_id').eq('user_id', uid).order('created_at'),
      supabase.from('shopping_extras').select('id, week_start, name, quantity, unit, is_purchased').eq('user_id', uid).order('created_at'),
      supabase.from('shopping_checks').select('week_start, recipe_id, ingredient_id, unit').eq('user_id', uid),
    ]);

    return {
      recipes: (check(recipes) as unknown as RecipeRow[]).map(recipeFromRow),
      mealPlans: check(plans).map((p) => ({ id: p.id, date: p.date, recipeId: p.recipe_id })),
      extras: check(extras).map((e) => ({
        id: e.id,
        weekStart: e.week_start,
        name: e.name,
        quantity: e.quantity == null ? null : Number(e.quantity),
        unit: e.unit,
        purchased: e.is_purchased,
      })),
      checks: check(checks).map((c) => ({ weekStart: c.week_start, recipeId: c.recipe_id, ingredientId: c.ingredient_id, unit: c.unit })),
    };
  }

  async saveRecipe(recipe: Parameters<Repo['saveRecipe']>[0]) {
    check(await supabase.rpc('save_recipe', { p: recipeToPayload(recipe) }));
  }

  async deleteRecipe(id: string) {
    const res = await supabase.from('recipes').delete().eq('id', id);
    if (res.error?.code === '23503') throw new UserFacingError('Esta receita é usada como subreceita em outra receita.', 'Não é possível excluir', 'conflict');
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

  async addExtra(extra: Parameters<Repo['addExtra']>[0]) {
    check(
      await supabase.from('shopping_extras').upsert(
        {
          id: extra.id,
          user_id: this.userId,
          week_start: extra.weekStart,
          name: extra.name,
          quantity: extra.quantity,
          unit: extra.unit,
          is_purchased: extra.purchased,
        },
        { ignoreDuplicates: true },
      ),
    );
  }

  async updateExtra(id: string, patch: Parameters<Repo['updateExtra']>[1]) {
    if (patch.purchased === undefined) return;
    check(await supabase.from('shopping_extras').update({ is_purchased: patch.purchased }).eq('id', id));
  }

  async deleteExtra(id: string) {
    check(await supabase.from('shopping_extras').delete().eq('id', id));
  }

  async setChecks(checks: ShoppingCheck[], checked: boolean) {
    if (!checks.length) return;
    if (checked) {
      check(
        await supabase.from('shopping_checks').upsert(
          checks.map((c) => ({ user_id: this.userId, week_start: c.weekStart, recipe_id: c.recipeId, ingredient_id: c.ingredientId, unit: c.unit })),
          { onConflict: 'user_id,week_start,recipe_id,ingredient_id,unit', ignoreDuplicates: true },
        ),
      );
      return;
    }
    const results = await Promise.all(
      checks.map((c) =>
        supabase
          .from('shopping_checks')
          .delete()
          .eq('user_id', this.userId)
          .eq('week_start', c.weekStart)
          .eq('recipe_id', c.recipeId)
          .eq('ingredient_id', c.ingredientId)
          .eq('unit', c.unit),
      ),
    );
    results.forEach(check);
  }
}
