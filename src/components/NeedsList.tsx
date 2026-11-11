import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { formatQuantity, type NeedGroup, type NeedItem } from '@/lib/shopping';
import { colors, spacing } from './theme';
import { Checkbox, styles } from './ui';

type Props = {
  groups: NeedGroup[];
  /** Com `onToggle`, cada item pode ser riscado (ex.: já tenho / já peguei). */
  isChecked?: (group: NeedGroup, item: NeedItem) => boolean;
  onToggle?: (group: NeedGroup, item: NeedItem) => void;
  /** Risca/desrisca o grupo inteiro (ex.: já tenho o subpreparo pronto). */
  onToggleGroup?: (group: NeedGroup, checked: boolean) => void;
};

/** Lista de compras agrupada por preparo: cada receita/subpreparo com os seus ingredientes. */
export function NeedsList({ groups, isChecked, onToggle, onToggleGroup }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      {groups.map((group) => {
        const allChecked = !!isChecked && group.items.every((i) => isChecked(group, i));
        return (
          <View key={group.recipeId} style={[styles.card, { padding: 0 }]}>
            <View style={[styles.row, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }]}>
              <Ionicons name={group.isSub ? 'git-branch-outline' : 'restaurant-outline'} size={18} color={allChecked ? colors.muted : colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.subtitle, allChecked && { color: colors.muted, textDecorationLine: 'line-through' }]} numberOfLines={1}>
                  {group.name}
                </Text>
                {group.usedBy.length > 0 && (
                  <Text style={styles.muted} numberOfLines={1}>
                    {group.isSub ? 'subpreparo de ' : 'também usada em '}
                    {group.usedBy.join(', ')}
                  </Text>
                )}
              </View>
              {onToggleGroup && (
                <Pressable
                  onPress={() => onToggleGroup(group, !allChecked)}
                  accessibilityRole="button"
                  accessibilityLabel={allChecked ? `Desmarcar tudo de ${group.name}` : `Riscar tudo de ${group.name}`}
                  hitSlop={8}
                  style={({ pressed }) => [{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, pressed && { opacity: 0.6 }]}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>{allChecked ? 'Desmarcar' : 'Riscar tudo'}</Text>
                </Pressable>
              )}
            </View>
            {group.items.map((item) => {
              const qty = formatQuantity(item.quantity, item.unit);
              const checked = !!isChecked?.(group, item);
              const text = (
                <Text style={[styles.body, { flex: 1 }, checked && { textDecorationLine: 'line-through', color: colors.muted }]}>
                  {item.name}
                  {qty ? <Text style={{ fontWeight: '700' }}>{`  ${qty}`}</Text> : null}
                </Text>
              );
              return (
                <View key={item.key}>
                  <View style={styles.separator} />
                  {onToggle ? (
                    <Pressable
                      onPress={() => onToggle(group, item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${item.name}, ${group.name}`}
                      style={({ pressed }) => [
                        styles.row,
                        { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md },
                        pressed && { backgroundColor: colors.primaryLight },
                      ]}
                    >
                      <Checkbox checked={checked} />
                      {text}
                    </Pressable>
                  ) : (
                    <View style={[styles.row, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md }]}>
                      <Text style={{ color: colors.accent, fontSize: 18 }}>•</Text>
                      {text}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
