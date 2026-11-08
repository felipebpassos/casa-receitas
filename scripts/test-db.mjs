// Teste de fumaça do backend local: SQL, RPCs e RLS.
// Testa SQL, funções e RLS contra o Supabase do .env (use o local!). Cria usuários de teste.
// Uso: npm run test:db
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const projectDir = process.argv[2] ?? process.cwd();
const require = createRequire(`${projectDir}/package.json`);
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  readFileSync(`${projectDir}/.env`, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_KEY;
const catalog = JSON.parse(readFileSync(`${projectDir}/src/data/catalog.json`, 'utf8'));
const gid = (name) => catalog.find((i) => i.name === name).id;

const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${!cond && extra ? `  -> ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
};

async function user(name) {
  const c = client();
  const email = `${name}.${Date.now()}@teste.local`;
  const { data, error } = await c.auth.signUp({ email, password: 'senha123', options: { data: { display_name: name } } });
  if (error) throw error;
  return { c, id: data.user.id };
}

const recipe = (fields, items) => ({
  id: randomUUID(), description: null, preparation: null, source_url: null, source_platform: null,
  is_public: false, origin_recipe_id: null, origin_author_name: null, created_at: new Date().toISOString(),
  ...fields,
  items: items.map((i) => ({ id: randomUUID(), quantity: null, unit: null, ingredient_id: null, sub_recipe_id: null, ...i })),
});

const anon = client();
const A = await user('Ana');
const B = await user('Beto');

// Catálogo global visível para visitante
const cat = await anon.from('ingredients').select('id').is('created_by', null);
ok(cat.data?.length === catalog.length, `catálogo global com ${catalog.length} itens visível sem login`, cat.error ?? cat.data?.length);

// Perfil criado pelo trigger
const prof = await A.c.from('profiles').select('display_name').eq('id', A.id).single();
ok(prof.data?.display_name === 'Ana', 'trigger cria o profile com o nome', prof);

// Ingrediente personalizado da Ana
const tempero = { id: randomUUID(), name: 'Tempero da vó', default_unit: 'colher (chá)', created_by: A.id };
ok(!(await A.c.from('ingredients').insert(tempero)).error, 'Ana cria ingrediente personalizado');
const dup = await A.c.from('ingredients').insert({ ...tempero, id: randomUUID(), name: 'tempero da VO' });
ok(dup.error?.code === '23505', 'nome duplicado (sem acento/caixa) é bloqueado', dup.error);

// Ana: molho (privado) e lasanha (pública) usando o molho como subreceita
const molho = recipe({ name: 'Molho bolonhesa' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
  { ingredient_id: gid('Tomate'), quantity: 4, unit: 'unidade' },
  { ingredient_id: tempero.id, quantity: 1, unit: 'colher (chá)' },
]);
ok(!(await A.c.rpc('save_recipe', { p: molho })).error, 'Ana salva o molho (privado)');
const lasanha = recipe({ name: 'Lasanha', is_public: true, source_url: 'https://youtu.be/x', source_platform: 'youtube' }, [
  { ingredient_id: gid('Massa de lasanha'), quantity: 1, unit: 'pacote' },
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molho.id },
]);
const saveLas = await A.c.rpc('save_recipe', { p: lasanha });
ok(!saveLas.error, 'Ana publica a lasanha com subreceita', saveLas.error);

const molhoNow = await A.c.from('recipes').select('is_public').eq('id', molho.id).single();
ok(molhoNow.data?.is_public === true, 'publicar a lasanha publica também o molho (subreceita)', molhoNow);

const priv = await A.c.rpc('save_recipe', { p: { ...molho, is_public: false } });
ok(!!priv.error, 'não deixa tornar privado um preparo usado por receita pública', priv.error?.message);

const self = await A.c.rpc('save_recipe', { p: { ...molho, is_public: true, items: [...molho.items.map((i) => ({ ...i, id: randomUUID() })), { id: randomUUID(), sub_recipe_id: molho.id, ingredient_id: null }] } });
ok(!!self.error, 'receita não pode usar a si mesma como subreceita', self.error?.message);

// Visitante: busca e leitura da árvore
const s1 = await anon.rpc('search_public_recipes', { q: 'carne' });
ok(s1.data?.some((r) => r.name === 'Lasanha') === false && s1.data?.some((r) => r.name === 'Molho bolonhesa'), 'busca por ingrediente acha o molho (carne)', s1.data?.map((r) => r.name));
const s2 = await anon.rpc('search_public_recipes', { q: 'MOLHO' });
ok(s2.data?.some((r) => r.name === 'Lasanha'), 'busca pelo nome da subreceita acha a lasanha', s2.data?.map((r) => r.name));
const s3 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(s3.data?.[0]?.author_name === 'Ana' && Number(s3.data?.[0]?.item_count) === 3, 'resultado traz autor e nº de itens', s3.data);

const items = await anon.from('recipe_items').select('ingredient_id, sub_recipe_id').eq('recipe_id', molho.id);
ok(items.data?.length === 3, 'visitante lê os itens da subreceita pública', items);
const temp = await anon.from('ingredients').select('name').eq('id', tempero.id).maybeSingle();
ok(temp.data?.name === 'Tempero da vó', 'visitante lê nome de ingrediente personalizado usado em receita pública', temp);

// Privacidade
const segredo = recipe({ name: 'Receita secreta' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }]);
await A.c.rpc('save_recipe', { p: segredo });
const leak = await B.c.from('recipes').select('id').eq('id', segredo.id);
ok(leak.data?.length === 0, 'Beto não vê a receita privada da Ana', leak.data);
const leakAnon = await anon.from('recipe_items').select('id').eq('recipe_id', segredo.id);
ok(leakAnon.data?.length === 0, 'visitante não vê itens de receita privada', leakAnon.data);

// Beto não pode planejar/alterar receitas da Ana
const plan = await B.c.from('meal_plans').insert({ id: randomUUID(), user_id: B.id, date: '2026-11-10', recipe_id: lasanha.id });
ok(!!plan.error, 'Beto não planeja receita que não é dele (precisa salvar cópia)', plan.error?.code);
const hijack = await B.c.rpc('save_recipe', { p: { ...lasanha, name: 'Hackeada' } });
ok(!!hijack.error, 'Beto não altera a receita da Ana', hijack.error?.message);

// Beto salva cópias (molho primeiro, depois lasanha apontando para a cópia do molho)
const molhoCopy = recipe({ name: 'Molho bolonhesa', origin_recipe_id: molho.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
]);
const lasCopy = recipe({ name: 'Lasanha', origin_recipe_id: lasanha.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molhoCopy.id },
]);
ok(!(await B.c.rpc('save_recipe', { p: molhoCopy })).error && !(await B.c.rpc('save_recipe', { p: lasCopy })).error, 'Beto salva cópias com subreceita');
const pubCopy = await B.c.rpc('save_recipe', { p: { ...lasCopy, is_public: true } });
ok(!!pubCopy.error, 'cópia de receita de outra pessoa não pode ser publicada', pubCopy.error?.message);
const useOthers = await B.c.rpc('save_recipe', { p: recipe({ name: 'Usa molho da Ana' }, [{ sub_recipe_id: molho.id }]) });
ok(!!useOthers.error, 'Beto não usa receita da Ana como subreceita (só a própria cópia)', useOthers.error?.message);

// Semana, despensa e avulsos do Beto
ok(!(await B.c.from('meal_plans').insert({ id: randomUUID(), user_id: B.id, date: '2026-11-10', recipe_id: lasCopy.id })).error, 'Beto planeja a cópia dele');
const pan = await B.c.from('pantry_ingredients').upsert({ user_id: B.id, ingredient_id: gid('Mussarela') }, { onConflict: 'user_id,ingredient_id', ignoreDuplicates: true });
const pan2 = await B.c.from('pantry_ingredients').upsert({ user_id: B.id, ingredient_id: gid('Mussarela') }, { onConflict: 'user_id,ingredient_id', ignoreDuplicates: true });
ok(!pan.error && !pan2.error, 'despensa: marcar "tenho" é idempotente', pan.error ?? pan2.error);
ok(!(await B.c.from('pantry_recipes').insert({ user_id: B.id, recipe_id: molhoCopy.id })).error, 'despensa: marcar preparo pronto');
ok(!(await B.c.from('shopping_extras').insert({ id: randomUUID(), user_id: B.id, week_start: '2026-11-09', name: 'Detergente' })).error, 'item avulso');
const peek = await A.c.from('pantry_ingredients').select('*').eq('user_id', B.id);
ok(peek.data?.length === 0, 'Ana não vê a despensa do Beto', peek.data);

// Exclusão protegida
const del = await A.c.from('recipes').delete().eq('id', molho.id);
ok(del.error?.code === '23503', 'não exclui receita usada como subreceita', del.error);

// Carregamento como o app faz (RECIPE_SELECT)
const RECIPE_SELECT = readFileSync(`${projectDir}/src/lib/repo/rows.ts`, 'utf8').match(/RECIPE_SELECT =\s*'([^']+)'/)[1];
const load = await B.c.from('recipes').select(RECIPE_SELECT).eq('user_id', B.id);
const pubTree = await anon.from('recipes').select(RECIPE_SELECT).eq('id', lasanha.id).eq('is_public', true).maybeSingle();
ok(pubTree.data?.recipe_items?.length === 3, 'visitante carrega a receita pública com itens (como o app)', pubTree.error ?? pubTree.data);
ok(load.data?.length === 2 && load.data.every((r) => r.recipe_items.length > 0), 'Beto carrega a coleção com itens', load.error ?? load.data);

console.log(failures ? `\n${failures} falha(s)` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
