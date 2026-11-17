import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import type { RecipeKind } from '@/lib/types';
import { colors, radius } from './theme';

/** Quadrado com o ícone do tipo (Receita/Preparo), usado nos cards e listas. */
export function KindIcon({ kind, size = 40 }: { kind: RecipeKind; size?: number }) {
  const k = KIND[kind];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? radius.md : radius.sm,
        backgroundColor: k.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={k.icon} size={Math.round(size / 2)} color={k.color} />
    </View>
  );
}

type KindMeta = {
  label: string;
  plural: string;
  /** "Nova receita" / "Novo preparo". */
  newTitle: string;
  editTitle: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  background: string;
  description: string;
  examples: string;
  namePlaceholder: string;
};

/** Ícone, cor e textos de cada tipo. Receita: laranja da marca; Preparo: verde da panela. */
export const KIND: Record<RecipeKind, KindMeta> = {
  RECIPE: {
    label: 'Receita',
    plural: 'Receitas',
    newTitle: 'Nova receita',
    editTitle: 'Editar receita',
    icon: 'restaurant-outline',
    color: colors.primary,
    background: colors.primaryLight,
    description: 'Um prato completo. Pode usar seus preparos como ingrediente.',
    examples: 'Lasanha, hambúrguer, pizza, risoto...',
    namePlaceholder: 'Ex.: Lasanha à bolonhesa',
  },
  PREP: {
    label: 'Preparo',
    plural: 'Preparos',
    newTitle: 'Novo preparo',
    editTitle: 'Editar preparo',
    icon: 'layers-outline',
    color: colors.olive,
    background: colors.oliveLight,
    description: 'Uma base que você usa dentro de receitas.',
    examples: 'Arroz, molho de tomate, caldo de carne...',
    namePlaceholder: 'Ex.: Molho de tomate',
  },
};

/** Filtro por tipo nas listas: todos, só receitas ou só preparos. */
export type KindFilter = 'ALL' | RecipeKind;

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RECIPE', label: KIND.RECIPE.plural },
  { value: 'PREP', label: KIND.PREP.plural },
];
