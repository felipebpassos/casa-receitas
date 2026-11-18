import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from './BottomSheetModal';
import { KIND, type KindFilter } from './RecipeKind';
import { colors, fonts, radius, spacing } from './theme';
import { Button } from './ui';

/** Minhas: criadas por você. Salvas: cópias de receitas de outras pessoas. */
export type OriginFilter = 'ALL' | 'MINE' | 'SAVED';

export type RecipeFilters = { kind: KindFilter; origin: OriginFilter };

export const DEFAULT_FILTERS: RecipeFilters = { kind: 'ALL', origin: 'ALL' };

type Option<T> = { value: T; label: string; icon: ComponentProps<typeof Ionicons>['name'] };

const KIND_OPTIONS: Option<KindFilter>[] = [
  { value: 'ALL', label: 'Todos', icon: 'apps-outline' },
  { value: 'RECIPE', label: KIND.RECIPE.plural, icon: KIND.RECIPE.icon },
  { value: 'PREP', label: KIND.PREP.plural, icon: KIND.PREP.icon },
];

const ORIGIN_OPTIONS: Option<OriginFilter>[] = [
  { value: 'ALL', label: 'Todas', icon: 'albums-outline' },
  { value: 'MINE', label: 'Minhas', icon: 'person-outline' },
  { value: 'SAVED', label: 'Salvas', icon: 'bookmark-outline' },
];

/** Quantos filtros fogem do padrão (para o indicador no botão). */
export const activeFilterCount = (f: RecipeFilters) =>
  (Object.keys(DEFAULT_FILTERS) as (keyof RecipeFilters)[]).filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;

/** Botão redondo ao lado da busca; mostra quantos filtros estão ativos. */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filtros, ${count} ${count === 1 ? 'ativo' : 'ativos'}` : 'Filtros'}
      style={({ pressed }) => [s.button, active && s.buttonActive, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="options-outline" size={20} color={active ? colors.primary : colors.text} />
      {active && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Painel que sobe de baixo com os filtros. Aplica na hora; o botão do rodapé só fecha. */
export function FilterPanel({
  visible,
  value,
  onChange,
  onClose,
  resultCount,
}: {
  visible: boolean;
  value: RecipeFilters;
  onChange: (f: RecipeFilters) => void;
  onClose: () => void;
  resultCount: number;
}) {
  const set = <K extends keyof RecipeFilters>(key: K, v: RecipeFilters[K]) => onChange({ ...value, [key]: v });
  const active = activeFilterCount(value);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          title={resultCount === 0 ? 'Nenhum resultado' : `Ver ${resultCount} ${resultCount === 1 ? 'resultado' : 'resultados'}`}
          onPress={onClose}
        />
      }
    >
      <View style={s.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>Filtros</Text>
          <Text style={s.subtitle}>{active ? `${active} ${active === 1 ? 'filtro ativo' : 'filtros ativos'}` : 'Mostrando todo o caderno'}</Text>
        </View>
        <Pressable
          onPress={() => onChange(DEFAULT_FILTERS)}
          disabled={!active}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Limpar filtros"
          style={({ pressed }) => [s.clear, !active && { opacity: 0.4 }, pressed && { backgroundColor: colors.primaryLight }]}
        >
          <Ionicons name="refresh" size={15} color={colors.primary} />
          <Text style={s.clearText}>Limpar</Text>
        </Pressable>
      </View>

      <View style={s.sections}>
        <Section title="Tipo">
          <Tiles options={KIND_OPTIONS} value={value.kind} onChange={(v) => set('kind', v)} />
        </Section>
        <Section title="Origem">
          <Tiles options={ORIGIN_OPTIONS} value={value.origin} onChange={(v) => set('origin', v)} />
        </Section>
      </View>
    </BottomSheetModal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Opções lado a lado, em cartões com ícone (escolha única). */
function Tiles<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.tiles} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [s.tile, selected && s.tileSelected, pressed && !selected && { backgroundColor: colors.surface }]}
          >
            {selected && (
              <View style={s.check}>
                <Ionicons name="checkmark" size={11} color={colors.onPrimary} />
              </View>
            )}
            <Ionicons name={o.icon} size={22} color={selected ? colors.primary : colors.muted} />
            <Text style={[s.tileText, selected && s.tileTextSelected]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.onPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  title: { fontFamily: fonts.serifSemiBold, fontSize: 22, color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  clearText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  sections: { gap: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tileSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tileText: { fontSize: 14, fontWeight: '500', color: colors.text },
  tileTextSelected: { color: colors.primary, fontWeight: '700' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
