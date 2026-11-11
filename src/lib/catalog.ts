import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogJson from '@/data/catalog.json';
import { serviceError } from './errors';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Ingredient } from './types';

/**
 * Catálogo embutido no app (mesmos IDs do seed do banco). Funciona sem login e offline.
 * O catálogo atualizado vem do Supabase (inclui ingredientes aprovados depois da build).
 */
export const GLOBAL_CATALOG: Ingredient[] = (catalogJson as { id: string; name: string; unit: string }[]).map((i) => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  allowedUnits: null,
}));

const CACHE_KEY = 'receitas-de-casa:catalog:v1';

/** Último catálogo baixado (ou o embutido, se nunca baixou). */
export async function loadCachedCatalog(): Promise<Ingredient[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as Ingredient[]) : null;
    return cached?.length ? cached : GLOBAL_CATALOG;
  } catch {
    return GLOBAL_CATALOG;
  }
}

/** Baixa o catálogo do Supabase e guarda no cache. Sem Supabase configurado, devolve null. */
export async function fetchRemoteCatalog(): Promise<Ingredient[] | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error, status } = await supabase.from('ingredients').select('id, name, default_unit, allowed_units');
  if (error) throw serviceError({ ...error, status });
  const catalog = data.map((i): Ingredient => ({ id: i.id, name: i.name, unit: i.default_unit, allowedUnits: i.allowed_units }));
  if (catalog.length) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  return catalog;
}

/** Sugere um ingrediente que falta no catálogo (vai para moderação). Exige login. */
export async function suggestIngredient(suggestion: { name: string; unit: string | null; note: string | null }): Promise<void> {
  const { error, status } = await supabase.from('ingredient_suggestions').insert(suggestion);
  if (error) throw serviceError({ ...error, status });
}
