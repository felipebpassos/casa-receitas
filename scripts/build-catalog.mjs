// Gera o catálogo global embutido no app (src/data/catalog.json) e o seed SQL
// equivalente, com os MESMOS IDs — assim dados salvos no celular (sem login)
// referenciam ingredientes que também existem no banco.
//
// IDs já existentes são preservados; só itens novos ganham um UUID novo.
// Uso: node scripts/build-catalog.mjs
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import source from './catalog-source.mjs';

const jsonPath = new URL('../src/data/catalog.json', import.meta.url);
const sqlPath = new URL('../supabase/migrations/20261108000002_seed_catalog.sql', import.meta.url);

const previous = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];
const idByName = new Map(previous.map((i) => [i.name, i.id]));

const catalog = source.map(([name, unit]) => ({ id: idByName.get(name) ?? randomUUID(), name, unit }));
writeFileSync(jsonPath, JSON.stringify(catalog, null, 2) + '\n');

const esc = (s) => s.replace(/'/g, "''");
const rows = catalog.map((i) => `  ('${i.id}', '${esc(i.name)}', '${esc(i.unit)}')`).join(',\n');
writeFileSync(
  sqlPath,
  `-- Gerado por scripts/build-catalog.mjs — não edite à mão.\n` +
    `-- Catálogo global de ingredientes (created_by = null), com os mesmos IDs embutidos no app.\n` +
    `insert into public.ingredients (id, name, default_unit) values\n${rows}\n` +
    `on conflict (id) do update set name = excluded.name, default_unit = excluded.default_unit;\n`,
);

console.log(`${catalog.length} ingredientes gravados.`);
