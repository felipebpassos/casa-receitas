import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from './theme';

const useNativeDriver = Platform.OS !== 'web';
const spring = (anim: Animated.Value) => Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 10, tension: 80 });

/**
 * Painel modal que sobe de baixo, do tamanho do conteúdo (filtros, escolhas rápidas).
 * Fecha tocando fora, com o voltar do Android ou arrastando para baixo; em todos os casos
 * chama `onClose`, e a animação de saída roda quando `visible` vira false.
 */
export function BottomSheetModal({
  visible,
  onClose,
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fica fixo embaixo, separado do conteúdo por uma linha. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [anim] = useState(() => new Animated.Value(0));
  const [panelHeight, setPanelHeight] = useState(windowHeight);
  // Continua montado durante a animação de saída.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) spring(anim).start();
    else
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
  }, [visible, mounted, anim]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => anim.stopAnimation(),
        onPanResponderMove: (_, g) => anim.setValue(1 - Math.max(0, g.dy) / panelHeight),
        onPanResponderRelease: (_, g) => {
          if (g.dy > Math.min(120, panelHeight * 0.3) || g.vy > 1.2) onClose();
          else spring(anim).start();
        },
        onPanResponderTerminate: () => spring(anim).start(),
      }),
    [anim, panelHeight, onClose],
  );

  if (!mounted) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [panelHeight, 0], extrapolateRight: 'clamp' });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View
          {...pan.panHandlers}
          accessibilityViewIsModal
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          style={[s.panel, { maxHeight: windowHeight - insets.top - spacing.xl, transform: [{ translateY }] }]}
        >
          <View style={s.handleArea}>
            <View style={s.handle} />
          </View>
          <View style={s.body}>{children}</View>
          {footer ? <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : <View style={{ height: insets.bottom + spacing.md }} />}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(61,52,46,0.5)' },
  panel: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#3D342E',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  handleArea: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  handle: { width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
