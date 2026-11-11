/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedSubRecipes,
  computeGroups,
  countItems,
  formatQuantity,
  type NeedGroup,
  type NeedsContext,
  type RecipeLike,
} from '../shopping.ts';

const ing = (ingredientId: string, quantity: number | null, unit: string | null) => ({ ingredientId, subRecipeId: null, quantity, unit });
const sub = (subRecipeId: string) => ({ ingredientId: null, subRecipeId, quantity: null, unit: null });

const molho: RecipeLike = {
  id: 'molho',
  name: 'Molho bolonhesa',
  items: [ing('carne', 500, 'g'), ing('tomate', 4, 'unidade'), ing('cebola', 1, 'unidade')],
};
const lasanha: RecipeLike = {
  id: 'lasanha',
  name: 'Lasanha',
  items: [ing('massa', 1, 'pacote'), ing('mussarela', 300, 'g'), sub('molho')],
};
const macarrao: RecipeLike = {
  id: 'macarrao',
  name: 'Macarrão à bolonhesa',
  items: [ing('macarrao', 500, 'g'), sub('molho'), ing('mussarela', 200, 'g')],
};

const NAMES: Record<string, string> = {
  carne: 'Carne moída',
  tomate: 'Tomate',
  cebola: 'Cebola',
  massa: 'Massa de lasanha',
  mussarela: 'Mussarela',
  macarrao: 'Macarrão',
  arroz: 'Arroz',
  bife: 'Bife',
};

function ctx(recipes: RecipeLike[]): NeedsContext {
  return {
    getRecipe: (id) => recipes.find((r) => r.id === id),
    ingredientName: (id) => NAMES[id] ?? id,
  };
}

const all = [molho, lasanha, macarrao];
const group = (groups: NeedGroup[], id: string) => groups.find((g) => g.recipeId === id)!;
const qty = (g: NeedGroup, ingredientId: string) => g.items.find((i) => i.ingredientId === ingredientId)?.quantity;

test('cada preparo é um grupo: o mesmo ingrediente não é somado entre grupos', () => {
  const arroz: RecipeLike = { id: 'arroz', name: 'Arroz', items: [ing('arroz', 200, 'g'), ing('cebola', 1, 'unidade')] };
  const bife: RecipeLike = { id: 'bife', name: 'Bife acebolado', items: [ing('bife', 500, 'g'), ing('cebola', 1, 'unidade'), sub('arroz')] };
  const groups = computeGroups(['bife'], ctx([arroz, bife]));
  assert.deepEqual(groups.map((g) => g.recipeId), ['bife', 'arroz']);
  assert.equal(qty(group(groups, 'bife'), 'cebola'), 1);
  assert.equal(qty(group(groups, 'arroz'), 'cebola'), 1);
  assert.equal(group(groups, 'arroz').isSub, true);
  assert.deepEqual(group(groups, 'arroz').usedBy, ['Bife acebolado']);
  assert.equal(group(groups, 'bife').isSub, false);
});

test('subpreparo usado por duas receitas: um grupo só, contado uma vez por uso', () => {
  const groups = computeGroups(['lasanha', 'macarrao'], ctx(all));
  assert.deepEqual(groups.map((g) => g.recipeId), ['lasanha', 'molho', 'macarrao']);
  const m = group(groups, 'molho');
  assert.equal(qty(m, 'carne'), 1000);
  assert.deepEqual(m.usedBy, ['Lasanha', 'Macarrão à bolonhesa']);
  // mussarela fica separada em cada receita
  assert.equal(qty(group(groups, 'lasanha'), 'mussarela'), 300);
  assert.equal(qty(group(groups, 'macarrao'), 'mussarela'), 200);
  assert.equal(formatQuantity(1000, 'g'), '1 kg');
});

test('mesma receita planejada duas vezes conta duas vezes', () => {
  const groups = computeGroups(['lasanha', 'lasanha'], ctx(all));
  assert.equal(qty(group(groups, 'lasanha'), 'massa'), 2);
  assert.equal(qty(group(groups, 'molho'), 'tomate'), 8);
});

test('receita planejada que também é subpreparo não é marcada como subpreparo', () => {
  const groups = computeGroups(['molho', 'lasanha'], ctx(all));
  const m = group(groups, 'molho');
  assert.equal(m.isSub, false);
  assert.equal(qty(m, 'carne'), 1000);
  assert.deepEqual(m.usedBy, ['Lasanha']);
});

test('não soma unidades incompatíveis; converte kg→g', () => {
  const r: RecipeLike = { id: 'r', name: 'R', items: [ing('carne', 1, 'kg'), ing('carne', 200, 'g'), ing('carne', 1, 'pacote')] };
  const [g] = computeGroups(['r'], ctx([r]));
  assert.equal(g.items.length, 2);
  assert.equal(g.items.find((n) => n.unit === 'g')!.quantity, 1200);
});

test('receita só com subpreparos não gera grupo vazio', () => {
  const combo: RecipeLike = { id: 'combo', name: 'Combo', items: [sub('molho')] };
  const groups = computeGroups(['combo'], ctx([...all, combo]));
  assert.deepEqual(groups.map((g) => g.recipeId), ['molho']);
  assert.equal(countItems(groups), 3);
});

test('ciclo entre receitas não trava o cálculo', () => {
  const a: RecipeLike = { id: 'a', name: 'A', items: [ing('carne', 1, 'g'), sub('b')] };
  const b: RecipeLike = { id: 'b', name: 'B', items: [ing('tomate', 1, 'unidade'), sub('a')] };
  const groups = computeGroups(['a'], ctx([a, b]));
  assert.deepEqual(groups.map((g) => g.recipeId), ['a', 'b']);
  assert.equal(countItems(groups), 2);
});

test('não oferece como subreceita a própria receita nem quem depende dela', () => {
  const allowed = allowedSubRecipes(all, 'molho').map((r) => r.id);
  assert.deepEqual(allowed, []); // lasanha e macarrão usam o molho
  assert.deepEqual(allowedSubRecipes(all, 'lasanha').map((r) => r.id).sort(), ['macarrao', 'molho']);
});
