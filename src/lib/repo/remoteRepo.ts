import { supabase } from '../supabase';
import type { Ingredient, Snapshot } from '../types';
import { RECIPE_SELECT, recipeFromRow, recipeToPayload, type RecipeRow } from './rows';
import type { Repo } from './types';

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as NonNullable<T>;
}

/** Dados do usuário logado, no Supabase (protegidos por RLS). */
export class RemoteRepo implements Repo {
  constructor(private userId: string) {}

  async loadAll(): Promise<Snapshot> {
    const uid = this.userId;
    const [ingredients, recipes, pantryIng, pantryRec, plans, extras] = await Promise.all([
      supabase.from('ingredients').select('id, name, default_unit').eq('created_by', uid),
      supabase.from('recipes').select(RECIPE_SELECT).eq('user_id', uid).order('name'),
      supabase.from('pantry_ingredients').select('ingredient_id').eq('user_id', uid),
      supabase.from('pantry_recipes').select('recipe_id').eq('user_id', uid),
      supabase.from('meal_plans').select('id, date, recipe_id').eq('user_id', uid).order('created_at'),
      supabase.from('shopping_extras').select('id, week_start, name, quantity, unit, is_purchased').eq('user_id', uid).order('created_at'),
    ]);

    return {
      customIngredients: check(ingredients).map(
        (i): Ingredient => ({ id: i.id, name: i.name, unit: i.default_unit, custom: true }),
      ),
      recipes: (check(recipes) as unknown as RecipeRow[]).map(recipeFromRow),
      pantryIngredientIds: check(pantryIng).map((r) => r.ingredient_id),
      pantryRecipeIds: check(pantryRec).map((r) => r.recipe_id),
      mealPlans: check(plans).map((p) => ({ id: p.id, date: p.date, recipeId: p.recipe_id })),
      extras: check(extras).map((e) => ({
        id: e.id,
        weekStart: e.week_start,
        name: e.name,
        quantity: e.quantity == null ? null : Number(e.quantity),
        unit: e.unit,
        purchased: e.is_purchased,
      })),
    };
  }

  async createIngredient(ingredient: Ingredient) {
    const res = await supabase
      .from('ingredients')
      .insert({ id: ingredient.id, name: ingredient.name, default_unit: ingredient.unit, created_by: this.userId });
    if (res.error?.code === '23505') throw new Error('Esse ingrediente já existe.');
    check(res);
  }

  async saveRecipe(recipe: Parameters<Repo['saveRecipe']>[0]) {
    check(await supabase.rpc('save_recipe', { p: recipeToPayload(recipe) }));
  }

  async deleteRecipe(id: string) {
    const res = await supabase.from('recipes').delete().eq('id', id);
    if (res.error?.code === '23503') throw new Error('Esta receita é usada como subreceita em outra receita.');
    check(res);
  }

  async setPantryIngredient(ingredientId: string, has: boolean) {
    if (has) {
      check(
        await supabase
          .from('pantry_ingredients')
          .upsert({ user_id: this.userId, ingredient_id: ingredientId }, { onConflict: 'user_id,ingredient_id', ignoreDuplicates: true }),
      );
    } else {
      check(await supabase.from('pantry_ingredients').delete().eq('user_id', this.userId).eq('ingredient_id', ingredientId));
    }
  }

  async setPantryRecipe(recipeId: string, has: boolean) {
    if (has) {
      check(
        await supabase
          .from('pantry_recipes')
          .upsert({ user_id: this.userId, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true }),
      );
    } else {
      check(await supabase.from('pantry_recipes').delete().eq('user_id', this.userId).eq('recipe_id', recipeId));
    }
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
}
