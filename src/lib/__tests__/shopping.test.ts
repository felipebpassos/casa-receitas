/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedSubRecipes,
  computeNeeds,
  formatQuantity,
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
};

function ctx(recipes: RecipeLike[], haveIngredients: string[] = [], haveRecipes: string[] = []): NeedsContext {
  return {
    getRecipe: (id) => recipes.find((r) => r.id === id),
    ingredientName: (id) => NAMES[id] ?? id,
    hasIngredient: (id) => haveIngredients.includes(id),
    hasRecipe: (id) => haveRecipes.includes(id),
  };
}

const all = [molho, lasanha, macarrao];

test('sem o preparo em casa: pede os ingredientes das duas receitas', () => {
  const needs = computeNeeds(['lasanha'], ctx(all));
  assert.deepEqual(
    needs.map((n) => n.ingredientId).sort(),
    ['carne', 'cebola', 'massa', 'mussarela', 'tomate'],
  );
  assert.deepEqual(needs.find((n) => n.ingredientId === 'carne')!.usedIn, ['Molho bolonhesa']);
});

test('com o preparo pronto em casa: a subreceita não entra', () => {
  const needs = computeNeeds(['lasanha'], ctx(all, [], ['molho']));
  assert.deepEqual(needs.map((n) => n.ingredientId).sort(), ['massa', 'mussarela']);
});

test('semana: soma ingredientes repetidos, inclusive vindos de subreceitas', () => {
  const needs = computeNeeds(['lasanha', 'macarrao'], ctx(all));
  assert.equal(needs.find((n) => n.ingredientId === 'carne')!.quantity, 1000);
  assert.equal(needs.find((n) => n.ingredientId === 'mussarela')!.quantity, 500);
  assert.equal(formatQuantity(1000, 'g'), '1 kg');
});

test('ingredientes que tenho em casa não entram', () => {
  const needs = computeNeeds(['lasanha'], ctx(all, ['mussarela', 'tomate', 'cebola']));
  assert.deepEqual(needs.map((n) => n.ingredientId).sort(), ['carne', 'massa']);
});

test('mesma receita planejada duas vezes conta duas vezes', () => {
  const needs = computeNeeds(['lasanha', 'lasanha'], ctx(all));
  assert.equal(needs.find((n) => n.ingredientId === 'massa')!.quantity, 2);
});

test('não soma unidades incompatíveis; converte kg→g', () => {
  const r: RecipeLike = { id: 'r', name: 'R', items: [ing('carne', 1, 'kg'), ing('carne', 200, 'g'), ing('carne', 1, 'pacote')] };
  const needs = computeNeeds(['r'], ctx([r]));
  assert.equal(needs.length, 2);
  assert.equal(needs.find((n) => n.unit === 'g')!.quantity, 1200);
});

test('ciclo entre receitas não trava o cálculo', () => {
  const a: RecipeLike = { id: 'a', name: 'A', items: [ing('carne', 1, 'g'), sub('b')] };
  const b: RecipeLike = { id: 'b', name: 'B', items: [ing('tomate', 1, 'unidade'), sub('a')] };
  const needs = computeNeeds(['a'], ctx([a, b]));
  assert.deepEqual(needs.map((n) => n.ingredientId).sort(), ['carne', 'tomate']);
});

test('não oferece como subreceita a própria receita nem quem depende dela', () => {
  const allowed = allowedSubRecipes(all, 'molho').map((r) => r.id);
  assert.deepEqual(allowed, []); // lasanha e macarrão usam o molho
  assert.deepEqual(allowedSubRecipes(all, 'lasanha').map((r) => r.id).sort(), ['macarrao', 'molho']);
});
