-- =====================================================================
-- A lista de compras deixa de ser salva no banco: ela é calculada do plano
-- da semana e os riscos/itens avulsos ficam só no celular.
-- =====================================================================
drop table if exists public.shopping_checks;
drop table if exists public.shopping_extras;
