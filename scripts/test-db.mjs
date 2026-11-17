// Teste de fumaça do backend local: SQL, RPCs e RLS.
// Testa SQL, funções e RLS contra o Supabase do .env (use o local!). Cria usuários de teste.
// O painel (destaque, admins, fila de edições) usa a chave service_role: SUPABASE_SERVICE_ROLE_KEY (env/.env) ou `supabase status`.
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
  visibility: 'PRIVATE', origin_recipe_id: null, origin_author_name: null, created_at: new Date().toISOString(),
  ...fields,
  items: items.map((i) => ({ id: randomUUID(), quantity: null, unit: null, ingredient_id: null, sub_recipe_id: null, ...i })),
});
const visOf = async (c, id) => (await c.from('recipes').select('visibility').eq('id', id).single()).data?.visibility;

const anon = client();
const admin = client(serviceKey());
const A = await user('Ana');
const B = await user('Beto');
const listedOf = async (id) => (await admin.from('recipes').select('listed').eq('id', id).maybeSingle()).data?.listed === true;

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

// ------------------------------------------------------------ receitas, visibilidade e destaque
const molho = recipe({ name: 'Molho bolonhesa', kind: 'PREP' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
  { ingredient_id: gid('Tomate'), quantity: 4, unit: 'unidade' },
]);
ok(!(await A.c.rpc('save_recipe', { p: molho })).error, 'Ana salva o molho (preparo, privado)');
ok((await visOf(A.c, molho.id)) === 'PRIVATE', 'receita nova é PRIVATE');

// Receita x Preparo
const kindOf = async (id) => (await A.c.from('recipes').select('kind').eq('id', id).single()).data?.kind;
ok((await kindOf(molho.id)) === 'PREP', 'molho é gravado como preparo');
const flip = await A.c.rpc('save_recipe', { p: { ...molho, kind: 'RECIPE' } });
ok(!flip.error && (await kindOf(molho.id)) === 'PREP', 'o tipo não muda ao editar', flip.error);
const prato = recipe({ name: 'Prato qualquer' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }]);
await A.c.rpc('save_recipe', { p: prato });
ok((await kindOf(prato.id)) === 'RECIPE', 'sem tipo, vira receita');
const usesRecipe = await A.c.rpc('save_recipe', { p: recipe({ name: 'Usa receita' }, [{ sub_recipe_id: prato.id }]) });
ok(!!usesRecipe.error, 'receita não pode ser ingrediente (só preparo)', usesRecipe.error?.message);
const prepInPrep = await A.c.rpc('save_recipe', { p: recipe({ name: 'Preparo com preparo', kind: 'PREP' }, [{ sub_recipe_id: molho.id }]) });
ok(!!prepInPrep.error, 'preparo não usa outro preparo', prepInPrep.error?.message);

const lasanha = recipe({ name: 'Lasanha', visibility: 'PUBLIC', source_url: 'https://youtu.be/x', source_platform: 'youtube' }, [
  { ingredient_id: gid('Massa de lasanha'), quantity: 1, unit: 'pacote' },
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molho.id },
]);
const saveLas = await A.c.rpc('save_recipe', { p: lasanha });
ok(!saveLas.error, 'Ana publica a lasanha (com preparo)', saveLas.error);
ok((await visOf(A.c, lasanha.id)) === 'PUBLIC' && !(await listedOf(lasanha.id)), 'publicada fica PUBLIC, fora da busca');
ok((await visOf(A.c, molho.id)) === 'PUBLIC', 'o preparo usado fica público junto');

const s0 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(!s0.error && !s0.data?.some((r) => r.id === lasanha.id), 'receita pública não listada não aparece na busca', s0.error ?? s0.data);
const seen = await B.c.from('recipes').select('id').eq('id', lasanha.id);
ok(seen.data?.length === 1, 'Beto abre a receita pública da Ana', seen.data);
const prof0 = await anon.rpc('list_user_public_recipes', { p_user: A.id });
ok(
  prof0.data?.some((r) => r.id === lasanha.id) && prof0.data?.some((r) => r.id === molho.id) && !prof0.data?.some((r) => r.id === prato.id),
  'perfil público da Ana lista as públicas (não as privadas)',
  prof0.error ?? prof0.data?.map((r) => r.name),
);

const selfList = await A.c.from('recipes').update({ listed: true }).eq('id', lasanha.id);
ok(!selfList.error && !(await listedOf(lasanha.id)), 'Ana não se coloca na busca (update direto ignorado)', selfList.error);
const selfInsertId = randomUUID();
await A.c.from('recipes').insert({ id: selfInsertId, name: 'Já listada', visibility: 'PUBLIC', listed: true });
ok(!(await listedOf(selfInsertId)), 'Ana não cria receita já listada');
const rpcList = await A.c.rpc('save_recipe', { p: { ...lasanha, listed: true } });
ok(!rpcList.error && !(await listedOf(lasanha.id)), 'save_recipe ignora listed enviado pelo cliente');
const selfAdmin = await A.c.from('profiles').update({ is_admin: true }).eq('id', A.id);
const stillUser = await admin.from('profiles').select('is_admin').eq('id', A.id).single();
ok(!!selfAdmin.error && stillUser.data?.is_admin === false, 'Ana não se torna admin', selfAdmin.error ?? stillUser.data);
ok(!(await A.c.from('profiles').update({ display_name: 'Ana' }).eq('id', A.id)).error, 'Ana ainda muda o próprio nome');

const priv = await A.c.rpc('save_recipe', { p: { ...molho, visibility: 'PRIVATE' } });
ok(!!priv.error, 'não deixa tornar privado um preparo usado por receita pública', priv.error?.message);

// Destaque pelo painel (service_role)
const list = await admin.from('recipes').update({ listed: true }).eq('id', lasanha.id);
ok(!list.error && (await listedOf(lasanha.id)), 'painel coloca a lasanha na busca', list.error);
ok(await listedOf(molho.id), 'listar a lasanha lista também o molho (preparo)');

const s1 = await anon.rpc('search_public_recipes', { q: 'carne' });
ok(s1.data?.some((r) => r.name === 'Molho bolonhesa'), 'busca por ingrediente acha o molho (carne)', s1.data?.map((r) => r.name));
const s2 = await anon.rpc('search_public_recipes', { q: 'MOLHO' });
ok(s2.data?.some((r) => r.name === 'Lasanha'), 'busca pelo nome do preparo acha a lasanha', s2.data?.map((r) => r.name));
const s3 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(s3.data?.[0]?.author_name === 'Ana' && Number(s3.data?.[0]?.item_count) === 3, 'resultado traz autor e nº de itens', s3.data);
ok(s3.data?.[0]?.kind === 'RECIPE' && s1.data?.find((r) => r.name === 'Molho bolonhesa')?.kind === 'PREP', 'resultado traz o tipo', s3.data);
const items = await anon.from('recipe_items').select('ingredient_id').eq('recipe_id', molho.id);
ok(items.data?.length === 2, 'visitante lê os itens do preparo público', items);

// Edição de receita listada: os outros veem a versão aprovada até o admin aprovar
const pendingOf = async (id) => (await admin.from('recipe_pending_edits').select('snapshot').eq('recipe_id', id).maybeSingle()).data?.snapshot;
ok(!(await A.c.rpc('save_recipe', { p: { ...lasanha, name: 'Lasanha da Ana' } })).error, 'Ana edita a lasanha listada');
ok((await A.c.from('recipes').select('name').eq('id', lasanha.id).single()).data?.name === 'Lasanha da Ana', 'Ana vê a versão editada');
ok((await pendingOf(lasanha.id))?.name === 'Lasanha', 'a versão aprovada fica guardada na fila');
ok(await listedOf(lasanha.id), 'continua na busca enquanto a edição aguarda');
const s4 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(s4.data?.find((r) => r.id === lasanha.id)?.name === 'Lasanha', 'a busca mostra a versão aprovada', s4.data);
const snapAnon = await anon.from('recipe_pending_edits').select('snapshot').eq('recipe_id', lasanha.id).maybeSingle();
ok(snapAnon.data?.snapshot?.recipe_items?.length === 3, 'visitante lê o snapshot (com itens) para abrir a receita', snapAnon.error ?? snapAnon.data);
await A.c.rpc('save_recipe', { p: { ...lasanha, name: 'Lasanha da Ana', preparation: 'Monte em camadas.' } });
ok((await pendingOf(lasanha.id))?.name === 'Lasanha', 'várias edições mantêm o primeiro snapshot (o aprovado)');
await A.c.rpc('save_recipe', { p: lasanha });
ok(!(await pendingOf(lasanha.id)), 'desfazer a edição (igual à aprovada) tira da fila');
const forge = await A.c.from('recipe_pending_edits').insert({ recipe_id: lasanha.id, snapshot: { name: 'Falsa' } });
ok(!!forge.error, 'Ana não escreve snapshot direto', forge.error?.code);

await A.c.rpc('save_recipe', { p: { ...lasanha, name: 'Lasanha da Ana' } });
ok(!(await admin.rpc('approve_recipe_edit', { p_recipe: lasanha.id })).error && !(await pendingOf(lasanha.id)), 'painel aprova a edição');
const s5 = await anon.rpc('search_public_recipes', { q: 'lasanha' });
ok(s5.data?.find((r) => r.id === lasanha.id)?.name === 'Lasanha da Ana', 'depois de aprovada, a busca mostra a edição', s5.data);
const userApprove = await A.c.rpc('approve_recipe_edit', { p_recipe: lasanha.id });
ok(!!userApprove.error, 'usuário não chama approve_recipe_edit', userApprove.error?.code);

await A.c.from('recipes').update({ description: 'nova' }).eq('id', lasanha.id);
ok(!!(await pendingOf(lasanha.id)), 'update direto numa receita listada também entra na fila');
ok(!(await admin.rpc('reject_recipe_edit', { p_recipe: lasanha.id })).error, 'painel recusa a edição');
ok(
  !(await listedOf(lasanha.id)) && !(await pendingOf(lasanha.id)) && (await visOf(A.c, lasanha.id)) === 'PUBLIC',
  'recusar tira da busca, limpa a fila e mantém pública no perfil',
);
await admin.from('recipes').update({ listed: true }).eq('id', lasanha.id);
await A.c.from('recipe_items').insert({ recipe_id: lasanha.id, ingredient_id: gid('Sal'), quantity: 1, unit: 'g', position: 9 });
ok(!!(await pendingOf(lasanha.id)), 'mexer direto nos itens de receita listada entra na fila');
await A.c.rpc('save_recipe', { p: { ...lasanha, name: 'Lasanha da Ana' } });
await admin.rpc('approve_recipe_edit', { p_recipe: lasanha.id });

const bolo = recipe({ name: 'Bolo listado', visibility: 'PUBLIC' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }]);
await A.c.rpc('save_recipe', { p: bolo });
await admin.from('recipes').update({ listed: true }).eq('id', bolo.id);
await A.c.rpc('save_recipe', { p: { ...bolo, name: 'Bolo editado' } });
const delListed = await A.c.from('recipes').delete().eq('id', bolo.id);
ok(!delListed.error && !(await pendingOf(bolo.id)), 'excluir receita listada com edição pendente funciona', delListed.error);
const bolo2 = recipe({ name: 'Bolo 2', visibility: 'PUBLIC' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }]);
await A.c.rpc('save_recipe', { p: bolo2 });
await admin.from('recipes').update({ listed: true }).eq('id', bolo2.id);
await A.c.rpc('save_recipe', { p: { ...bolo2, name: 'Bolo 2 editado' } });
await A.c.rpc('save_recipe', { p: { ...bolo2, name: 'Bolo 2 editado', visibility: 'PRIVATE' } });
ok(!(await listedOf(bolo2.id)) && !(await pendingOf(bolo2.id)), 'tornar privada tira da busca e limpa a fila');
const { visibility: _v, ...bolo2Legacy } = bolo2;
const compat = await A.c.rpc('save_recipe', { p: { ...bolo2Legacy, submit: true } });
ok(!compat.error && (await visOf(A.c, bolo2.id)) === 'PUBLIC', 'apps antigos (submit: true) ainda publicam', compat.error);

// Admin: o que publica já entra na busca; editar não passa pela fila
const C = await user('Chef');
await admin.from('profiles').update({ is_admin: true }).eq('id', C.id);
const caldo = recipe({ name: 'Caldo de legumes', kind: 'PREP' }, [{ ingredient_id: gid('Tomate'), quantity: 2, unit: 'unidade' }]);
const sopa = recipe({ name: 'Sopa do chef', visibility: 'PUBLIC' }, [{ ingredient_id: gid('Sal'), quantity: 1, unit: 'g' }, { sub_recipe_id: caldo.id }]);
await C.c.rpc('save_recipe', { p: caldo });
ok(!(await C.c.rpc('save_recipe', { p: sopa })).error, 'admin publica a sopa');
ok((await listedOf(sopa.id)) && (await listedOf(caldo.id)), 'publicação de admin já entra na busca (com o preparo)');
await C.c.rpc('save_recipe', { p: { ...sopa, name: 'Sopa do chef (nova)' } });
ok(!(await pendingOf(sopa.id)), 'edição de admin não passa pela fila');
await C.c.rpc('save_recipe', { p: { ...sopa, visibility: 'PRIVATE' } });
ok(!(await listedOf(sopa.id)), 'admin deixando privada sai da busca');

const self = await A.c.rpc('save_recipe', { p: { ...molho, visibility: 'PUBLIC', items: [{ id: randomUUID(), sub_recipe_id: molho.id, ingredient_id: null }] } });
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
const molhoCopy = recipe({ name: 'Molho bolonhesa', kind: 'PREP', origin_recipe_id: molho.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Carne moída'), quantity: 500, unit: 'g' },
]);
const lasCopy = recipe({ name: 'Lasanha', origin_recipe_id: lasanha.id, origin_author_name: 'Ana' }, [
  { ingredient_id: gid('Mussarela'), quantity: 300, unit: 'g' },
  { sub_recipe_id: molhoCopy.id },
]);
ok(!(await B.c.rpc('save_recipe', { p: molhoCopy })).error && !(await B.c.rpc('save_recipe', { p: lasCopy })).error, 'Beto salva cópias com subreceita');
const pubCopy = await B.c.rpc('save_recipe', { p: { ...lasCopy, visibility: 'PUBLIC' } });
ok(!!pubCopy.error, 'cópia de receita de outra pessoa não pode ser publicada', pubCopy.error?.message);
const useOthers = await B.c.rpc('save_recipe', { p: recipe({ name: 'Usa molho da Ana' }, [{ sub_recipe_id: molho.id }]) });
ok(!!useOthers.error, 'Beto não usa receita da Ana como subreceita (só a própria cópia)', useOthers.error?.message);

// ------------------------------------------------------------ semana
ok(!(await B.c.from('meal_plans').insert({ id: randomUUID(), user_id: B.id, date: '2026-11-10', recipe_id: lasCopy.id })).error, 'Beto planeja a cópia dele');

// Exclusão protegida
const del = await A.c.from('recipes').delete().eq('id', molho.id);
ok(del.error?.code === '23503', 'não exclui receita usada como subreceita', del.error);

// Carregamento como o app faz (RECIPE_SELECT)
const RECIPE_SELECT = readFileSync(`${projectDir}/src/lib/repo/rows.ts`, 'utf8').match(/RECIPE_SELECT =\s*'([^']+)'/)[1];
const load = await B.c.from('recipes').select(RECIPE_SELECT).eq('user_id', B.id);
const pubTree = await anon.from('recipes').select(RECIPE_SELECT).eq('id', lasanha.id).eq('visibility', 'PUBLIC').maybeSingle();
ok(pubTree.data?.recipe_items?.length === 3, 'visitante carrega a receita pública com itens (como o app)', pubTree.error ?? pubTree.data);
ok(load.data?.length === 2 && load.data.every((r) => r.recipe_items.length > 0), 'Beto carrega a coleção com itens', load.error ?? load.data);

console.log(failures ? `\n${failures} falha(s)` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
