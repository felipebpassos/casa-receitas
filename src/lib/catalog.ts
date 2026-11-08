import catalogJson from '@/data/catalog.json';
import type { Ingredient } from './types';

/** Catálogo global embutido no app (mesmos IDs do seed do banco). Funciona sem login e offline. */
export const GLOBAL_CATALOG: Ingredient[] = (catalogJson as { id: string; name: string; unit: string }[]).map((i) => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  custom: false,
}));

export const GLOBAL_IDS = new Set(GLOBAL_CATALOG.map((i) => i.id));
