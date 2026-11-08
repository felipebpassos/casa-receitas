// Conversão entre as linhas do banco (snake_case) e os tipos do app.
import type { Recipe, RecipeItem } from '../types';

// recipe_items tem duas FKs para recipes (dona e subreceita): o embed precisa nomear a FK da dona.
export const RECIPE_SELECT =
  'id, user_id, name, description, preparation, source_url, source_platform, is_public, origin_recipe_id, origin_author_name, created_at, updated_at, recipe_items:recipe_items!recipe_items_recipe_id_fkey(id, position, ingredient_id, sub_recipe_id, quantity, unit)';

export type RecipeRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  preparation: string | null;
  source_url: string | null;
  source_platform: string | null;
  is_public: boolean;
  origin_recipe_id: string | null;
  origin_author_name: string | null;
  created_at: string;
  updated_at: string;
  recipe_items: {
    id: string;
    position: number;
    ingredient_id: string | null;
    sub_recipe_id: string | null;
    quantity: number | string | null;
    unit: string | null;
  }[];
};

export function recipeFromRow(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preparation: row.preparation,
    sourceUrl: row.source_url,
    sourcePlatform: row.source_platform,
    isPublic: row.is_public,
    originRecipeId: row.origin_recipe_id,
    originAuthorName: row.origin_author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: [...(row.recipe_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(
        (i): RecipeItem => ({
          id: i.id,
          ingredientId: i.ingredient_id,
          subRecipeId: i.sub_recipe_id,
          // numeric chega como string do PostgREST
          quantity: i.quantity == null ? null : Number(i.quantity),
          unit: i.unit,
        }),
      ),
  };
}

export function recipeToPayload(r: Recipe) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    preparation: r.preparation,
    source_url: r.sourceUrl,
    source_platform: r.sourcePlatform,
    is_public: r.isPublic,
    origin_recipe_id: r.originRecipeId,
    origin_author_name: r.originAuthorName,
    created_at: r.createdAt,
    items: r.items.map((i) => ({
      id: i.id,
      ingredient_id: i.ingredientId,
      sub_recipe_id: i.subRecipeId,
      quantity: i.quantity,
      unit: i.unit,
    })),
  };
}
