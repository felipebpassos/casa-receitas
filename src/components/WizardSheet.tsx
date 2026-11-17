import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode, type Ref } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecipeKind } from '@/lib/types';
import { KIND, KindIcon } from './RecipeKind';
import { colors, fonts, radius, spacing } from './theme';

const useNativeDriver = Platform.OS !== 'web';

/** Animação de entrada/saída da folha. `open()` ao montar; `close(depois)` antes de sair da tela. */
export function useSheetAnimation() {
  const [anim] = useState(() => new Animated.Value(0));
  return {
    anim,
    open: () => Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 10, tension: 70 }).start(),
    close: (then?: () => void) =>
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver }).start(() => then?.()),
  };
}

/**
 * Folha que sobe de baixo, com cabeçalho próprio (voltar/fechar), transição entre etapas
 * e um "tremidinho" quando algo precisa ser corrigido.
 */
export function WizardSheet({
  anim,
  kind,
  title,
  step,
  direction,
  shakeSignal,
  onBack,
  onClose,
  scrollRef,
  footer,
  overlay,
  children,
}: {
  anim: Animated.Value;
  kind: RecipeKind;
  title: string;
  /** Muda a cada etapa: dispara a transição do conteúdo. */
  step: number;
  /** 1 = avançando (entra pela direita), -1 = voltando. */
  direction: 1 | -1;
  /** Incrementar para sacudir o conteúdo (erro de validação). */
  shakeSignal: number;
  onBack?: () => void;
  onClose: () => void;
  scrollRef?: Ref<ScrollViewInstance>;
  footer: ReactNode;
  /** Camada por cima de tudo (ex.: comemoração ao salvar). */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const k = KIND[kind];
  const [stepAnim] = useState(() => new Animated.Value(1));
  const [shake] = useState(() => new Animated.Value(0));
  // Ícone do tipo no cabeçalho: "pula" e balança só ao abrir a folha (não ao voltar para a etapa 1).
  const [iconPop] = useState(() => new Animated.Value(0));
  const [iconWiggle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.spring(iconPop, { toValue: 1, friction: 5, tension: 110, delay: 220, useNativeDriver }),
      Animated.sequence([1, -1, 0.5, 0].map((v) => Animated.timing(iconWiggle, { toValue: v, duration: 90, useNativeDriver }))),
    ]).start();
  }, [iconPop, iconWiggle]);

  useEffect(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, useNativeDriver, friction: 9, tension: 80 }).start();
  }, [step, stepAnim]);

  useEffect(() => {
    if (!shakeSignal) return;
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 0.7, -0.7, 0.3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, easing: Easing.linear, useNativeDriver })),
    ).start();
  }, [shakeSignal, shake]);

  const sheetHeight = height - insets.top - spacing.xl;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });
  const stepStyle = {
    opacity: stepAnim,
    transform: [
      { translateX: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [direction * 32, 0] }) },
      { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
    ],
  };
  const titleStyle = {
    opacity: stepAnim,
    transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  return (
    <View style={s.root}>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav} pointerEvents="box-none">
        <Animated.View accessibilityViewIsModal style={[s.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
          {/* Bolhas decorativas na cor do tipo */}
          <View pointerEvents="none" style={[s.blob, { backgroundColor: k.background, width: 180, height: 180, top: -90, right: -50 }]} />
          <View pointerEvents="none" style={[s.blob, { backgroundColor: k.background, width: 70, height: 70, top: 28, right: 110, opacity: 0.6 }]} />
          <View pointerEvents="none" style={[s.blob, { backgroundColor: k.color, width: 10, height: 10, top: 22, right: 86, opacity: 0.35 }]} />

          <View style={s.handle} />
          <View style={s.header}>
            {onBack ? (
              <RoundButton icon="arrow-back" label="Voltar" onPress={onBack} />
            ) : (
              <Animated.View
                style={{
                  transform: [{ scale: iconPop }, { rotate: iconWiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) }],
                }}
              >
                <KindIcon kind={kind} size={40} />
              </Animated.View>
            )}
            <Animated.View style={[{ flex: 1 }, titleStyle]}>
              <Text style={s.title} numberOfLines={1}>
                {title}
              </Text>
            </Animated.View>
            <RoundButton icon="close" label="Fechar" onPress={onClose} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={[{ gap: spacing.lg }, stepStyle]}>{children}</Animated.View>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{footer}</View>
          {overlay}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'arrow-back' | 'close'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.round, pressed && { transform: [{ scale: 0.92 }], backgroundColor: colors.surface }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(61,52,46,0.5)' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#3D342E',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  blob: { position: 'absolute', borderRadius: radius.pill },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: { fontFamily: fonts.serifSemiBold, fontSize: 21, color: colors.text },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
