// Validação de formulários com yup. Os schemas ficam aqui (puros, testáveis);
// as telas usam `validate()` e mostram `errors[campo]` embaixo de cada campo.
import * as yup from 'yup';
import { parseSource } from './source.ts';

yup.setLocale({
  mixed: { required: 'Campo obrigatório.', notType: 'Valor inválido.' },
  string: {
    email: 'Informe um e-mail válido.',
    min: ({ min }) => `Use pelo menos ${min} caracteres.`,
    max: ({ max }) => `Use no máximo ${max} caracteres.`,
  },
  array: { min: ({ min }) => `Adicione pelo menos ${min} item(ns).` },
});

/** Erros por caminho do campo (ex.: "name", "items[2].quantity"). */
export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; value: T; errors: FieldErrors } | { ok: false; errors: FieldErrors; first: string };

/** Valida todos os campos de uma vez e devolve as mensagens por campo. */
export function validate<S extends yup.AnyObjectSchema>(schema: S, values: unknown): ValidationResult<yup.InferType<S>> {
  try {
    const value = schema.validateSync(values, { abortEarly: false, stripUnknown: true });
    return { ok: true, value, errors: {} };
  } catch (e) {
    if (!(e instanceof yup.ValidationError)) throw e;
    const errors: FieldErrors = {};
    for (const inner of e.inner.length ? e.inner : [e]) {
      const path = inner.path ?? '';
      if (!(path in errors)) errors[path] = inner.message;
    }
    return { ok: false, errors, first: Object.values(errors)[0] };
  }
}

/** Valida um campo só (para revalidar enquanto a pessoa corrige). */
export function validateField(schema: yup.AnyObjectSchema, path: string, values: unknown): string | null {
  try {
    schema.validateSyncAt(path, values);
    return null;
  } catch (e) {
    if (e instanceof yup.ValidationError) return e.message;
    throw e;
  }
}

/** "1,5" → 1.5. Vazio, zero ou inválido → null. */
export function parseQuantity(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------------ conta

const email = yup.string().trim().required('Informe seu e-mail.').email();
const password = yup.string().required('Informe sua senha.').min(6, 'A senha precisa ter pelo menos 6 caracteres.');

export const signInSchema = yup.object({ email, password });

/** Mesma regra do banco (public.is_valid_username). */
export const USERNAME_RE = /^[a-z][a-z0-9]*([._][a-z0-9]+)*$/;

/** " @Ana_B " → "ana_b". */
export function normalizeUsername(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/^@+/, '').toLowerCase();
}

const username = yup
  .string()
  .transform((v) => normalizeUsername(v))
  .required('Escolha um nome de usuário.')
  .min(3, 'Use pelo menos 3 caracteres.')
  .max(20, 'Use no máximo 20 caracteres.')
  .test('start', 'Comece com uma letra.', (v) => !v || /^[a-z]/.test(v))
  .test('chars', 'Use só letras, números, ponto e "_".', (v) => !v || /^[a-z0-9._]+$/.test(v))
  .test('separators', 'Não termine nem repita ponto ou "_".', (v) => !v || USERNAME_RE.test(v));

export const usernameSchema = yup.object({ username });

export const signUpSchema = yup.object({
  username,
  email,
  password,
});

// ---------------------------------------------------------------- receita

export const NO_QUANTITY_UNIT = 'a gosto';

const recipeItemSchema = yup.object({
  name: yup.string().default(''),
  ingredientId: yup.string().nullable().default(null),
  subRecipeId: yup.string().nullable().default(null),
  unit: yup.string().nullable().default(null),
  quantity: yup
    .string()
    .default('')
    .test('quantity', function (value) {
      const { ingredientId, unit, name } = this.parent as { ingredientId: string | null; unit: string | null; name: string };
      const filled = !!value?.trim();
      // Ingrediente exige quantidade (exceto "a gosto"); subreceita é opcional, mas se preencher tem de ser válida.
      if (ingredientId && unit !== NO_QUANTITY_UNIT && !filled) return this.createError({ message: `Informe a quantidade de "${name}" (ou use "a gosto").` });
      if (filled && parseQuantity(value) == null) return this.createError({ message: 'Use um número maior que zero (ex.: 2 ou 1,5).' });
      return true;
    }),
});

export const recipeSchema = yup.object({
  name: yup.string().trim().required('Dê um nome para a receita.').max(120),
  description: yup.string().trim().max(500).default(''),
  preparation: yup.string().trim().max(20000).default(''),
  source: yup
    .string()
    .trim()
    .default('')
    .test('source', 'Confira o link da receita.', (v) => !v || !!parseSource(v)),
  items: yup.array().of(recipeItemSchema).required().min(1, 'Adicione pelo menos um ingrediente.'),
});

// ---------------------------------------------- sugestão de ingrediente

export const suggestionSchema = yup.object({
  name: yup.string().trim().required('Informe o nome do ingrediente.').min(2).max(60),
  unit: yup.string().nullable().default(null),
  note: yup.string().trim().max(300).default(''),
});

// ------------------------------------------------- item extra das compras

export const extraSchema = yup.object({
  name: yup.string().trim().required('Informe o item.').max(80),
  quantity: yup
    .string()
    .default('')
    .test('quantity', 'Use um número maior que zero.', (v) => !v?.trim() || parseQuantity(v) != null),
  unit: yup.string().nullable().default(null),
});
