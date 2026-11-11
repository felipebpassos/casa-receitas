/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraSchema, parseQuantity, recipeSchema, signInSchema, signUpSchema, validate } from '../validation.ts';

const ingredient = (quantity: string, unit: string | null = 'g') => ({ name: 'Farinha', ingredientId: 'i1', subRecipeId: null, quantity, unit });
const subRecipe = (quantity: string) => ({ name: 'Molho', ingredientId: null, subRecipeId: 'r1', quantity, unit: null });

test('parseQuantity aceita vírgula e rejeita zero/negativo/texto', () => {
  assert.equal(parseQuantity('1,5'), 1.5);
  assert.equal(parseQuantity(' 2 '), 2);
  assert.equal(parseQuantity('0'), null);
  assert.equal(parseQuantity('-1'), null);
  assert.equal(parseQuantity('abc'), null);
  assert.equal(parseQuantity(''), null);
});

test('receita válida passa e vem com os textos aparados', () => {
  const r = validate(recipeSchema, { name: '  Bolo  ', description: '', preparation: '', source: '', items: [ingredient('200')] });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.name, 'Bolo');
});

test('receita: nome, ingredientes e link são verificados de uma vez', () => {
  const r = validate(recipeSchema, { name: ' ', description: '', preparation: '', source: 'não é link', items: [] });
  assert.equal(r.ok, false);
  assert.equal(r.errors.name, 'Dê um nome para a receita.');
  assert.equal(r.errors.items, 'Adicione pelo menos um ingrediente.');
  assert.match(r.errors.source, /link/);
});

test('receita: quantidade por linha', () => {
  const r = validate(recipeSchema, {
    name: 'Bolo',
    items: [ingredient(''), ingredient('', 'a gosto'), ingredient('0'), subRecipe(''), subRecipe('x')],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors['items[0].quantity'], /Farinha/);
  assert.equal(r.errors['items[1].quantity'], undefined); // "a gosto" dispensa quantidade
  assert.match(r.errors['items[2].quantity'], /maior que zero/);
  assert.equal(r.errors['items[3].quantity'], undefined); // subreceita: opcional
  assert.match(r.errors['items[4].quantity'], /maior que zero/);
});

test('login e cadastro', () => {
  const bad = validate(signInSchema, { email: 'fulano', password: '123' });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.email, 'Informe um e-mail válido.');
  assert.match(bad.errors.password, /6 caracteres/);

  const empty = validate(signInSchema, { email: '', password: '' });
  assert.equal(empty.errors.email, 'Informe seu e-mail.');

  const ok = validate(signUpSchema, { name: ' Ana ', email: ' ana@x.com ', password: '123456' });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.email, 'ana@x.com');
});

test('item extra das compras', () => {
  assert.equal(validate(extraSchema, { name: 'Detergente', quantity: '', unit: null }).ok, true);
  assert.equal(validate(extraSchema, { name: '', quantity: '', unit: null }).errors.name, 'Informe o item.');
  assert.ok(validate(extraSchema, { name: 'Sabão', quantity: 'muito', unit: null }).errors.quantity);
});
