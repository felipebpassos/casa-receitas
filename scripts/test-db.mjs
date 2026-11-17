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

// Contas criadas pelo teste: apagadas no fim (o banco local fica só com as contas reais).
const created = [];
const RUN = Date.now().toString(36).slice(-6);
async function user(name, meta) {
  const c = client();
  const email = `${name}.${Date.now()}@teste.local`;
  const username = `${name.toLowerCase()}_${RUN}`;
  const { data, error } = await c.auth.signUp({ email, password: 'senha123', options: { data: meta ?? { username } } });
  if (error) throw error;
  created.push(data.user.id);
  return { c, id: data.user.id, username, email };
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

const prof = await A.c.from('profiles').select('username, username_confirmed').eq('id', A.id).single();
ok(prof.data?.username === A.username && prof.data?.username_confirmed === true, 'trigger cria o profile com o usuário escolhido', prof);

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
ok(!!(await A.c.from('profiles').update({ is_admin: false }).eq('id', A.id)).error, 'Ana não altera o profile direto');
ok(!!(await A.c.from('profiles').update({ username: 'hacker' }).eq('id', A.id)).error, 'Ana não altera username direto (só via set_username)');

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
ok(s3.data?.[0]?.author_name === A.username && Number(s3.data?.[0]?.item_count) === 3, 'resultado traz autor e nº de itens', s3.data);
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

// ------------------------------------------------------------ nome de usuário
const unameOf = async (id) => (await admin.from('profiles').select('username, username_confirmed').eq('id', id).single()).data;
// Sem usuário (como no Google): gera do e-mail e pede confirmação; o mesmo começo de e-mail ganha número.
// Como no Google (sem username nos metadados). E-mail com maiúscula e hífen: hífen vira ponto.
const googleUser = async (domain) => {
  const c = client();
  const { data, error } = await c.auth.signUp({ email: `Ze.Go-${RUN}@${domain}.local`, password: 'senha123', options: { data: { full_name: 'Zé Google' } } });
  if (error) throw error;
  created.push(data.user.id);
  return { c, id: data.user.id };
};
const G1 = await googleUser('um');
const G2 = await googleUser('dois');
const g1 = await unameOf(G1.id), g2 = await unameOf(G2.id);
ok(g1?.username === `ze.go.${RUN}` && g1.username_confirmed === false, 'sem usuário: gera do e-mail (minúsculo, inválido vira ponto) e não confirma', g1);
ok(g2?.username === `ze.go.${RUN}2`, 'mesmo começo de e-mail: próximo número livre', g2);
// Usuário escolhido já em uso no cadastro → cai no gerado, para confirmar.
const D = await user('Dup', { username: A.username });
const d = await unameOf(D.id);
ok(d?.username !== A.username && d?.username_confirmed === false, 'cadastro com usuário em uso não quebra: gera outro e pede confirmação', d);

ok((await anon.rpc('username_available', { u: A.username.toUpperCase() })).data === false, 'username_available: em uso (ignora maiúsculas)');
ok((await anon.rpc('username_available', { u: `livre_${RUN}` })).data === true, 'username_available: livre');
ok((await anon.rpc('username_available', { u: 'a..b' })).data === false, 'username_available: formato inválido = indisponível');

const bad = await G1.c.rpc('set_username', { u: '1abc' });
ok(bad.error?.code === '22023', 'set_username recusa formato inválido', bad.error);
const taken = await G1.c.rpc('set_username', { u: A.username });
ok(taken.error?.code === '23505', 'set_username recusa usuário em uso', taken.error);
const mine = await G1.c.rpc('set_username', { u: `Zeca_${RUN}` });
const g1b = await unameOf(G1.id);
ok(!mine.error && g1b?.username === `zeca_${RUN}` && g1b.username_confirmed, 'set_username grava em minúsculas e confirma', mine.error ?? g1b);
ok(!!(await anon.rpc('set_username', { u: `anon_${RUN}` })).error, 'visitante não chama set_username');

// Buscar amigos: só o usuário exato.
const exact = await anon.rpc('search_public_profiles', { q: ` @${A.username.toUpperCase()} ` });
ok(exact.data?.length === 1 && exact.data[0].id === A.id && exact.data[0].username === A.username, 'busca acha pelo usuário exato (com @ e maiúsculas)', exact.error ?? exact.data);
const partial = await anon.rpc('search_public_profiles', { q: A.username.slice(0, -1) });
ok(partial.data?.length === 0, 'busca não acha por trecho do usuário', partial.data);
const byName = await anon.rpc('search_public_profiles', { q: 'Zé Google' });
ok(byName.data?.length === 0, 'busca não acha pelo nome antigo', byName.data);
const pending = await anon.rpc('search_public_profiles', { q: g2.username });
ok(pending.data?.length === 0, 'busca não acha quem ainda não confirmou o usuário', pending.data);
const confirmed = await anon.rpc('search_public_profiles', { q: g1b.username });
ok(confirmed.data?.length === 1 && confirmed.data[0].id === G1.id, 'busca acha depois de confirmar', confirmed.data);
const authorRow = (await anon.rpc('list_user_public_recipes', { p_user: A.id })).data?.[0];
ok(!authorRow || authorRow.author_name === A.username, 'autor das receitas públicas é o usuário', authorRow);

// ------------------------------------------------------------ seguir
const statsOf = async (c, id) => (await c.rpc('follow_stats', { p_user: id })).data?.[0];
ok(!(await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })).error, 'Beto segue a Ana');
ok(!(await C.c.from('follows').insert({ follower_id: C.id, followee_id: A.id })).error, 'Chef segue a Ana');
ok(!(await A.c.from('follows').insert({ follower_id: A.id, followee_id: B.id })).error, 'Ana segue o Beto');
ok((await B.c.from('follows').insert({ follower_id: B.id, followee_id: A.id })).error?.code === '23505', 'seguir de novo não duplica');
ok(!!(await A.c.from('follows').insert({ follower_id: A.id, followee_id: A.id })).error, 'ninguém segue a si mesmo');
ok(!!(await A.c.from('follows').insert({ follower_id: B.id, followee_id: C.id })).error, 'Ana não cria follow em nome do Beto');
ok(!!(await anon.from('follows').insert({ follower_id: A.id, followee_id: B.id })).error, 'visitante não segue ninguém');

const stAnon = await statsOf(anon, A.id);
ok(Number(stAnon?.followers_count) === 2 && stAnon?.following_count === null && stAnon?.is_following === false, 'visitante vê só o nº de seguidores da Ana', stAnon);
const stB = await statsOf(B.c, A.id);
ok(Number(stB?.followers_count) === 2 && stB?.following_count === null && stB?.is_following === true, 'Beto vê que segue a Ana, mas não quem ela segue', stB);
const stA = await statsOf(A.c, A.id);
ok(Number(stA?.followers_count) === 2 && Number(stA?.following_count) === 1, 'Ana vê seguidores e seguindo dela', stA);

const fl = await A.c.rpc('list_my_follows', { p_kind: 'followers' });
ok(fl.data?.length === 2 && fl.data.some((p) => p.id === B.id && p.username === B.username) && fl.data.some((p) => p.id === C.id), 'Ana lista quem segue ela', fl.error ?? fl.data);
const fg = await A.c.rpc('list_my_follows', { p_kind: 'following' });
ok(fg.data?.length === 1 && fg.data[0].id === B.id, 'Ana lista quem ela segue', fg.error ?? fg.data);
const peek = await B.c.from('follows').select('follower_id').eq('followee_id', A.id);
ok(peek.data?.length === 1 && peek.data[0].follower_id === B.id, 'Beto não vê os outros seguidores da Ana (só a própria linha)', peek.data);
ok(!(await anon.from('follows').select('follower_id')).data?.length, 'visitante não lê follows');
ok(!!(await anon.rpc('list_my_follows', { p_kind: 'followers' })).error, 'visitante não chama list_my_follows');

await A.c.from('follows').delete().eq('follower_id', B.id).eq('followee_id', A.id);
ok(Number((await statsOf(anon, A.id))?.followers_count) === 2, 'Ana não remove o follow do Beto');
ok(!(await B.c.from('follows').delete().eq('follower_id', B.id).eq('followee_id', A.id)).error, 'Beto deixa de seguir a Ana');
ok(Number((await statsOf(anon, A.id))?.followers_count) === 1, 'contagem cai depois de deixar de seguir');

// ------------------------------------------------------------ limpeza
// Itens primeiro: a trava de subreceita (restrict) impediria apagar as receitas em cascata.
const createdRecipes = (await admin.from('recipes').select('id').in('user_id', created)).data?.map((r) => r.id) ?? [];
if (createdRecipes.length) await admin.from('recipe_items').delete().in('recipe_id', createdRecipes);
for (const id of created) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) console.log('aviso: não apagou a conta de teste', id, error.message);
}

console.log(failures ? `\n${failures} falha(s)` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
