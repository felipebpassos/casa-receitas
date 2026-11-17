import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { colors, radius, spacing } from './theme';

export type DropdownItem = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  destructive?: boolean;
};

const MENU_WIDTH = 220;

/**
 * Menu suspenso ancorado no gatilho (alinhado pela direita, logo abaixo dele).
 * `trigger` recebe a função que abre o menu: passe a ela o evento do toque,
 * que serve para medir a posição do botão tocado.
 */
export function DropdownMenu({ items, trigger }: { items: DropdownItem[]; trigger: (open: (e: GestureResponderEvent) => void) => ReactNode }) {
  const { width: screenWidth } = useWindowDimensions();
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  const open = (e: GestureResponderEvent) => {
    const target = e.currentTarget;
    if (typeof target === 'number') return;
    target.measureInWindow((x, y, width, height) => {
      setPosition({ top: y + height + spacing.xs, right: Math.max(spacing.sm, screenWidth - (x + width)) });
    });
  };
  const close = () => setPosition(null);

  const select = (item: DropdownItem) => {
    close();
    item.onPress();
  };

  return (
    <>
      {trigger(open)}
      <Modal visible={!!position} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fechar menu" />
        {position && (
          <View accessibilityRole="menu" style={[s.menu, position]}>
            {items.map((item, idx) => {
              const color = item.destructive ? colors.danger : colors.text;
              return (
                <View key={item.label}>
                  {idx > 0 && <View style={s.separator} />}
                  <Pressable
                    onPress={() => select(item)}
                    accessibilityRole="menuitem"
                    style={({ pressed }) => [s.item, pressed && { backgroundColor: item.destructive ? colors.dangerLight : colors.surface }]}
                  >
                    <Ionicons name={item.icon} size={20} color={color} />
                    <Text style={[s.label, { color }]}>{item.label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#3D342E',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  label: { fontSize: 16 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
