// Teste de fumaça do backend local: SQL, RPCs e RLS.
// Testa SQL, funções e RLS contra o Supabase do .env (use o local!). Cria usuários de teste.
// A moderação usa a chave service_role: SUPABASE_SERVICE_ROLE_KEY (env/.env) ou `supabase status`.
// Uso: npm run test:db
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const projectDir = process.argv[2] ?? process.cwd();
const require = createRequire(`${projectDir}/package.json`);
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  readFileSync(`${projectDir}/.env`, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_KEY;
const catalog = JSON.parse(readFileSync(`${projectDir}/src/data/catalog.json`, 'utf8'));
const gid = (name) => catalog.find((i) => i.name === name).id;

function serviceKey() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv) return fromEnv;
  const out = execSync('npx supabase status -o env', { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out.match(/SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)?.[1];
}

const client = (key = KEY) => createClient(URL_, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
  submit: false, origin_recipe_id: null, origin_author_name: null, created_at: new Date().toISOString(),
  ...fields,
  items: items.map((i) => ({ id: randomUUID(), quantity: null, unit: null, ingredient_id: null, sub_recipe_id: null, ...i })),
});
const statusOf = async (c, id) => (await c.from('recipes').select('status').eq('id', id).single()).data?.status;

const anon = client();
const admin = client(serviceKey());
const A = await user('Ana');
const B = await user('Beto');

// ------------------------------------------------------------ catálogo
const cat = await anon.from('ingredients').select('id');
ok(cat.data?.length >= catalog.length, `catálogo com ${catalog.length}+ itens visível sem login`, cat.error ?? cat.data?.length);

const prof = await A.c.from('profiles').select('display_name').eq('id', A.id).single();
ok(prof.data?.display_name === 'Ana', 'trigger cria o profile com o nome', prof);

const ingInsert = await A.c.from('ingredients').insert({ id: randomUUID(), name: 'Tempero da vó', default_unit: 'g' });
ok(!!ingInsert.error, 'usuário não cria ingrediente (catálogo fechado)', ingInsert.error?.code);
const ingUpdate = await A.c.from('ingredients').update({ name: 'Hackeado' }).eq('id', gid('Sal')).select();
ok(!ingUpdate.data?.length, 'usuário não altera ingrediente do catálogo', ingUpdate.data);

const fake = await A.c.rpc('save_recipe', { p: recipe({ name: 'Fora do catálogo' }, [{ ingredient_id: randomUUID(), quantity: 1, unit: 'g' }]) });
ok(/catálogo/.test(fake.error?.message ?? ''), 'save_recipe recusa ingrediente fora do catálogo', fake.error?.message);

// Sugestões
ok(!(await A.c.from('ingredient_suggestions').insert({ name: 'Tahine', unit: 'g', note: 'pasta de gergelim' })).error, 'Ana sugere ingrediente');
const sugB = await B.c.from('ingredient_suggestions').select('id');
ok(sugB.data?.length === 0, 'Beto não vê as sugestões da Ana', sugB.data);
const sugApproved = await A.c.from('ingredient_suggestions').insert({ name: 'Zaatar', status: 'APPROVED' });
ok(!!sugApproved.error, 'usuário não cria sugestão já aprovada', sugApproved.error?.code);

// ------------------------------------------------------------ receitas e moderação
const molho = recipe({ name: 'Molho bolonhesa' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
  { ingredient_id: gid('Tomate'), quantity: 4, unit: 'unidade' },
]);
ok(!(await A.c.rpc('save_recipe', { p: molho })).error, 'Ana salva o molho (privado)');
ok((await statusOf(A.c, molho.id)) === 'PRIVATE', 'receita nova é PRIVATE');

const lasanha = recipe({ name: 'Lasanha', submit: true, source_url: 'https://youtu.be/x', source_platform: 'youtube' }, [
  { ingredient_id: gid('Massa de lasanha'), quantity: 1, unit: 'pacote' },
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molho.id },
]);
const saveLas = await A.c.rpc('save_recipe', { p: lasanha });
ok(!saveLas.error, 'Ana envia a lasanha (com subreceita) para a biblioteca', saveLas.error);
ok((await statusOf(A.c, lasanha.id)) === 'PENDING', 'enviada fica PENDING');
ok((await statusOf(A.c, molho.id)) === 'PENDING', 'a subreceita vai para análise junto');

const s0 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(!s0.error && !s0.data?.some((r) => r.id === lasanha.id), 'receita em análise não aparece na biblioteca', s0.error ?? s0.data);
const pend = await B.c.from('recipes').select('id').eq('id', lasanha.id);
ok(pend.data?.length === 0, 'Beto não vê receita em análise da Ana', pend.data);

const selfApprove = await A.c.from('recipes').update({ status: 'APPROVED' }).eq('id', lasanha.id);
ok(/moderação/.test(selfApprove.error?.message ?? ''), 'Ana não aprova a própria receita (update direto)', selfApprove.error);
const selfInsert = await A.c.from('recipes').insert({ id: randomUUID(), name: 'Já aprovada', status: 'APPROVED' });
ok(!!selfInsert.error, 'Ana não cria receita já aprovada', selfInsert.error?.message);
const rpcApprove = await A.c.rpc('save_recipe', { p: { ...lasanha, status: 'APPROVED' } });
ok(!rpcApprove.error && (await statusOf(A.c, lasanha.id)) === 'PENDING', 'save_recipe ignora status enviado pelo cliente');

const priv = await A.c.rpc('save_recipe', { p: { ...molho, submit: false } });
ok(!!priv.error, 'não deixa tornar privado um preparo usado por receita enviada', priv.error?.message);

// Moderação (painel = service_role)
const approve = await admin.from('recipes').update({ status: 'APPROVED' }).eq('id', lasanha.id);
ok(!approve.error, 'moderação aprova a lasanha', approve.error);
ok((await statusOf(A.c, molho.id)) === 'APPROVED', 'aprovar a lasanha aprova também o molho (subreceita)');
const reviewed = await admin.from('recipes').select('reviewed_at').eq('id', lasanha.id).single();
ok(!!reviewed.data?.reviewed_at, 'reviewed_at é preenchido na aprovação', reviewed.data);

const s1 = await anon.rpc('search_public_recipes', { q: 'carne' });
ok(s1.data?.some((r) => r.name === 'Molho bolonhesa'), 'busca por ingrediente acha o molho (carne)', s1.data?.map((r) => r.name));
const s2 = await anon.rpc('search_public_recipes', { q: 'MOLHO' });
ok(s2.data?.some((r) => r.name === 'Lasanha'), 'busca pelo nome da subreceita acha a lasanha', s2.data?.map((r) => r.name));
const s3 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(s3.data?.[0]?.author_name === 'Ana' && Number(s3.data?.[0]?.item_count) === 3, 'resultado traz autor e nº de itens', s3.data);
const items = await anon.from('recipe_items').select('ingredient_id').eq('recipe_id', molho.id);
ok(items.data?.length === 2, 'visitante lê os itens da subreceita aprovada', items);

// Alterar receita aprovada volta para análise
const directItem = await A.c.from('recipe_items').insert({ recipe_id: lasanha.id, ingredient_id: gid('Sal'), quantity: 1, unit: 'g' });
ok(!!directItem.error, 'itens de receita aprovada não mudam direto', directItem.error?.code);
await A.c.from('recipes').update({ description: 'nova' }).eq('id', lasanha.id);
ok((await statusOf(A.c, lasanha.id)) === 'PENDING', 'editar receita aprovada (update direto) a devolve para PENDING');
await admin.from('recipes').update({ status: 'APPROVED' }).eq('id', lasanha.id);
ok(!(await A.c.rpc('save_recipe', { p: { ...lasanha, name: 'Lasanha da Ana' } })).error, 'Ana edita a lasanha aprovada via save_recipe');
ok((await statusOf(A.c, lasanha.id)) === 'PENDING', 'editar receita aprovada via save_recipe a devolve para PENDING');

// Recusa com motivo
await admin.from('recipes').update({ status: 'REJECTED', rejection_reason: 'Faltou o modo de preparo.' }).eq('id', lasanha.id);
const rej = await A.c.from('recipes').select('status, rejection_reason').eq('id', lasanha.id).single();
ok(rej.data?.status === 'REJECTED' && rej.data?.rejection_reason === 'Faltou o modo de preparo.', 'Ana vê a recusa e o motivo', rej.data);
const resend = await A.c.rpc('save_recipe', { p: { ...lasanha, preparation: 'Monte em camadas.' } });
const resent = await A.c.from('recipes').select('status, rejection_reason').eq('id', lasanha.id).single();
ok(!resend.error && resent.data?.status === 'PENDING' && resent.data?.rejection_reason === null, 'reenviar limpa o motivo e volta para PENDING', resent.data);
await admin.from('recipes').update({ status: 'APPROVED' }).eq('id', lasanha.id);

const self = await A.c.rpc('save_recipe', { p: { ...molho, submit: true, items: [{ id: randomUUID(), sub_recipe_id: molho.id, ingredient_id: null }] } });
ok(!!self.error, 'receita não pode usar a si mesma como subreceita', self.error?.message);

// ------------------------------------------------------------ privacidade
const segredo = recipe({ name: 'Receita secreta' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }]);
await A.c.rpc('save_recipe', { p: segredo });
const leak = await B.c.from('recipes').select('id').eq('id', segredo.id);
ok(leak.data?.length === 0, 'Beto não vê a receita privada da Ana', leak.data);
const leakAnon = await anon.from('recipe_items').select('id').eq('recipe_id', segredo.id);
ok(leakAnon.data?.length === 0, 'visitante não vê itens de receita privada', leakAnon.data);

const plan = await B.c.from('meal_plans').insert({ id: randomUUID(), user_id: B.id, date: '2026-11-10', recipe_id: lasanha.id });
ok(!!plan.error, 'Beto não planeja receita que não é dele (precisa salvar cópia)', plan.error?.code);
const hijack = await B.c.rpc('save_recipe', { p: { ...lasanha, name: 'Hackeada' } });
ok(!!hijack.error, 'Beto não altera a receita da Ana', hijack.error?.message);

// Cópias do Beto
const molhoCopy = recipe({ name: 'Molho bolonhesa', origin_recipe_id: molho.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
]);
const lasCopy = recipe({ name: 'Lasanha', origin_recipe_id: lasanha.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molhoCopy.id },
]);
ok(!(await B.c.rpc('save_recipe', { p: molhoCopy })).error && !(await B.c.rpc('save_recipe', { p: lasCopy })).error, 'Beto salva cópias com subreceita');
const pubCopy = await B.c.rpc('save_recipe', { p: { ...lasCopy, submit: true } });
ok(!!pubCopy.error, 'cópia de receita de outra pessoa não pode ser enviada', pubCopy.error?.message);
const useOthers = await B.c.rpc('save_recipe', { p: recipe({ name: 'Usa molho da Ana' }, [{ sub_recipe_id: molho.id }]) });
ok(!!useOthers.error, 'Beto não usa receita da Ana como subreceita (só a própria cópia)', useOthers.error?.message);

// ------------------------------------------------------------ semana, itens riscados e avulsos
ok(!(await B.c.from('meal_plans').insert({ id: randomUUID(), user_id: B.id, date: '2026-11-10', recipe_id: lasCopy.id })).error, 'Beto planeja a cópia dele');
const chk = { user_id: B.id, week_start: '2026-11-09', recipe_id: molhoCopy.id, ingredient_id: gid('Carne moída'), unit: 'g' };
const c1 = await B.c.from('shopping_checks').upsert(chk, { onConflict: 'user_id,week_start,recipe_id,ingredient_id,unit', ignoreDuplicates: true });
const c2 = await B.c.from('shopping_checks').upsert(chk, { onConflict: 'user_id,week_start,recipe_id,ingredient_id,unit', ignoreDuplicates: true });
ok(!c1.error && !c2.error, 'riscar item é idempotente', c1.error ?? c2.error);
const peek = await A.c.from('shopping_checks').select('*').eq('user_id', B.id);
ok(peek.data?.length === 0, 'Ana não vê a lista do Beto', peek.data);
ok(!(await B.c.from('shopping_extras').insert({ id: randomUUID(), user_id: B.id, week_start: '2026-11-09', name: 'Detergente' })).error, 'item avulso');

// Exclusão protegida
const del = await A.c.from('recipes').delete().eq('id', molho.id);
ok(del.error?.code === '23503', 'não exclui receita usada como subreceita', del.error);

// Carregamento como o app faz (RECIPE_SELECT)
const RECIPE_SELECT = readFileSync(`${projectDir}/src/lib/repo/rows.ts`, 'utf8').match(/RECIPE_SELECT =\s*'([^']+)'/)[1];
const load = await B.c.from('recipes').select(RECIPE_SELECT).eq('user_id', B.id);
const pubTree = await anon.from('recipes').select(RECIPE_SELECT).eq('id', lasanha.id).eq('status', 'APPROVED').maybeSingle();
ok(pubTree.data?.recipe_items?.length === 3, 'visitante carrega a receita aprovada com itens (como o app)', pubTree.error ?? pubTree.data);
ok(load.data?.length === 2 && load.data.every((r) => r.recipe_items.length > 0), 'Beto carrega a coleção com itens', load.error ?? load.data);

console.log(failures ? `\n${failures} falha(s)` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
