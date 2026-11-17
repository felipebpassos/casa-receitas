// Gera o catálogo global embutido no app (src/data/catalog.json) e o seed SQL
// equivalente, com os MESMOS IDs — assim dados salvos no celular (sem login)
// referenciam ingredientes que também existem no banco.
//
// IDs já existentes são preservados; só itens novos ganham um UUID novo.
// Como o seed original já foi aplicado nos bancos existentes, os itens novos
// e as renomeações (ver `renames` em catalog-source.mjs) também são gravados numa
// migration nova (supabase/migrations/<timestamp>_catalog_changes.sql).
// Uso: node scripts/build-catalog.mjs
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import source, { renames } from './catalog-source.mjs';

const jsonPath = new URL('../src/data/catalog.json', import.meta.url);
const sqlPath = new URL('../supabase/migrations/20261108000002_seed_catalog.sql', import.meta.url);

// Mesma regra de public.normalize_name (índice único do banco).
const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const seen = new Map();
for (const [name] of source) {
  const key = normalize(name);
  if (seen.has(key)) throw new Error(`Nome duplicado no catálogo: "${name}" x "${seen.get(key)}"`);
  seen.set(key, name);
}

const previous = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];
const idByName = new Map(previous.map((i) => [i.name, i.id]));

// Renomeações: o nome novo herda o ID do antigo.
const renamed = [];
for (const [from, to] of Object.entries(renames)) {
  const id = idByName.get(from);
  if (!id || idByName.has(to)) continue;
  idByName.delete(from);
  idByName.set(to, id);
  renamed.push({ id, from, to });
}
for (const { to } of renamed) {
  if (!seen.has(normalize(to))) throw new Error(`Renomeado para "${to}", que não está na lista do catálogo.`);
}

const catalog = source.map(([name, unit]) => ({ id: idByName.get(name) ?? randomUUID(), name, unit }));
writeFileSync(jsonPath, JSON.stringify(catalog, null, 2) + '\n');

const esc = (s) => s.replace(/'/g, "''");
const toRows = (items) => items.map((i) => `  ('${i.id}', '${esc(i.name)}', '${esc(i.unit)}')`).join(',\n');
writeFileSync(
  sqlPath,
  `-- Gerado por scripts/build-catalog.mjs — não edite à mão.\n` +
    `-- Catálogo global de ingredientes, com os mesmos IDs embutidos no app.\n` +
    `insert into public.ingredients (id, name, default_unit) values\n${toRows(catalog)}\n` +
    `on conflict (id) do update set name = excluded.name, default_unit = excluded.default_unit;\n`,
);

const previousIds = new Set(previous.map((i) => i.id));
const added = previous.length ? catalog.filter((i) => !previousIds.has(i.id)) : [];
if (added.length || renamed.length) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const migrationPath = new URL(`../supabase/migrations/${stamp}_catalog_changes.sql`, import.meta.url);
  let sql = `-- Gerado por scripts/build-catalog.mjs — não edite à mão.\n`;
  if (renamed.length) {
    sql +=
      `\n-- Ingredientes renomeados (mantêm o ID).\n` +
      renamed.map((r) => `update public.ingredients set name = '${esc(r.to)}' where id = '${r.id}'; -- era '${esc(r.from)}'\n`).join('');
  }
  if (added.length) {
    sql +=
      `\n-- Ingredientes adicionados ao catálogo global (mesmos IDs embutidos no app).\n` +
      `-- "do nothing": em bancos novos o seed já inseriu estas linhas; em bancos antigos,\n` +
      `-- um nome já aprovado via sugestão é mantido.\n` +
      `insert into public.ingredients (id, name, default_unit) values\n${toRows(added)}\n` +
      `on conflict do nothing;\n`;
  }
  writeFileSync(migrationPath, sql);
  console.log(`${renamed.length} renomeados, ${added.length} novos → ${migrationPath.pathname.split('/').pop()}`);
}

console.log(`${catalog.length} ingredientes gravados.`);
