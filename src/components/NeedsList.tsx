import { Pressable, Text, View } from 'react-native';
import { formatQuantity, type NeedItem } from '@/lib/shopping';
import { colors, spacing } from './theme';
import { Checkbox, styles } from './ui';

/**
 * Lista do que comprar. Com `onBought`, cada item tem a caixa "comprei",
 * que marca o ingrediente como "tenho" na Despensa (e ele sai da lista).
 */
export function NeedsList({ items, onBought, showUsedIn = true }: { items: NeedItem[]; onBought?: (item: NeedItem) => void; showUsedIn?: boolean }) {
  return (
    <View>
      {items.map((item, idx) => {
        const qty = formatQuantity(item.quantity, item.unit);
        const content = (
          <>
            {onBought && <Checkbox checked={false} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.body}>
                {item.name}
                {qty ? <Text style={{ fontWeight: '700' }}>{`  ${qty}`}</Text> : null}
              </Text>
              {showUsedIn && (
                <Text style={styles.muted} numberOfLines={1}>
                  {item.usedIn.join(', ')}
                </Text>
              )}
            </View>
          </>
        );
        return (
          <View key={item.key}>
            {idx > 0 && <View style={styles.separator} />}
            {onBought ? (
              <Pressable
                onPress={() => onBought(item)}
                accessibilityRole="checkbox"
                accessibilityLabel={`Comprei ${item.name}`}
                style={({ pressed }) => [styles.row, { paddingVertical: spacing.md, gap: spacing.md }, pressed && { backgroundColor: colors.primaryLight }]}
              >
                {content}
              </Pressable>
            ) : (
              <View style={[styles.row, { paddingVertical: spacing.sm, gap: spacing.md }]}>
                <Text style={{ color: colors.accent, fontSize: 18 }}>•</Text>
                {content}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
