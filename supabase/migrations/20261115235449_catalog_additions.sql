-- Gerado por scripts/build-catalog.mjs — não edite à mão.
-- Ingredientes adicionados ao catálogo global (mesmos IDs embutidos no app).
-- "do nothing": em bancos novos o seed já inseriu estas linhas; em bancos antigos,
-- um nome já aprovado via sugestão é mantido.
insert into public.ingredients (id, name, default_unit) values
  ('886539a9-58f2-4376-87d5-01d1aecf7d62', 'Água', 'ml'),
  ('86848169-283e-42cb-921c-efe72c0e01d3', 'Água quente', 'ml')
on conflict do nothing;
