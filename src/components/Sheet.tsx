import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode, type Ref } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecipeKind } from '@/lib/types';
import { KIND, KindIcon } from './RecipeKind';
import { colors, fonts, radius, spacing } from './theme';

const useNativeDriver = Platform.OS !== 'web';

/**
 * Animação de entrada/saída da folha: sobe ao montar; `close(depois)` desce e então chama `depois`.
 * `dismiss()` desce e sai da tela (volta, ou vai para o início se não houver para onde voltar).
 */
export type SheetControls = ReturnType<typeof useSheet>;

export function useSheet() {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 10, tension: 70 }).start();
  }, [anim]);
  const close = (then?: () => void) =>
    Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver }).start(() => then?.());
  return {
    anim,
    close,
    dismiss: () => close(() => (router.canGoBack() ? router.back() : router.replace('/'))),
  };
}

/** Botão redondo do cabeçalho da folha (mesmo visual do fechar). */
export function SheetButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  children,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  active?: boolean;
  disabled?: boolean;
  /** Conteúdo no lugar do ícone (ex.: carregando). */
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [
        s.round,
        active && { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
        pressed && { transform: [{ scale: 0.92 }], backgroundColor: colors.surface },
      ]}
    >
      {children ?? (icon ? <Ionicons name={icon} size={20} color={active ? colors.primary : colors.text} /> : null)}
    </Pressable>
  );
}

/**
 * Folha que sobe de baixo, com cabeçalho próprio (ícone do tipo, título, ações e fechar).
 * Extras opcionais para o cadastro em etapas: ícone que "pula" ao abrir, transição entre
 * etapas e um "tremidinho" quando algo precisa ser corrigido.
 */
export function Sheet({
  anim,
  kind,
  title,
  onClose,
  onBack,
  closeButton = true,
  swipeToClose = true,
  headerRight,
  footer,
  overlay,
  scrollRef,
  animateIcon,
  step = 0,
  direction = 1,
  shakeSignal = 0,
  children,
}: {
  anim: Animated.Value;
  /** Tipo da receita: ícone do cabeçalho e cor das bolhas. Sem tipo, sem ícone. */
  kind?: RecipeKind;
  title: string;
  onClose: () => void;
  /** Mostra a seta de voltar no lugar do ícone do tipo. */
  onBack?: () => void;
  /** Mostra o botão de fechar (X) no cabeçalho. */
  closeButton?: boolean;
  /** Arrastar o topo da folha (alça e cabeçalho) para baixo fecha. */
  swipeToClose?: boolean;
  /** Ações à direita, antes do fechar. */
  headerRight?: ReactNode;
  footer?: ReactNode;
  /** Camada por cima de tudo (ex.: comemoração ao salvar). */
  overlay?: ReactNode;
  scrollRef?: Ref<ScrollViewInstance>;
  /** Ícone do tipo "pula" e balança ao abrir. */
  animateIcon?: boolean;
  /** Muda a cada etapa: dispara a transição do conteúdo. */
  step?: number;
  /** 1 = avançando (entra pela direita), -1 = voltando. */
  direction?: 1 | -1;
  /** Incrementar para sacudir o conteúdo (erro de validação). */
  shakeSignal?: number;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const k = kind ? KIND[kind] : null;
  const [stepAnim] = useState(() => new Animated.Value(1));
  const [shake] = useState(() => new Animated.Value(0));
  // Valores guardados: ao voltar para a etapa 1 o ícone remonta, mas não anima de novo.
  const [iconPop] = useState(() => new Animated.Value(animateIcon ? 0 : 1));
  const [iconWiggle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animateIcon) return;
    Animated.sequence([
      Animated.spring(iconPop, { toValue: 1, friction: 5, tension: 110, delay: 220, useNativeDriver }),
      Animated.sequence([1, -1, 0.5, 0].map((v) => Animated.timing(iconWiggle, { toValue: v, duration: 90, useNativeDriver }))),
    ]).start();
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A folha pode trocar no meio da subida (ex.: "carregando" → receita pública carregada).
  // A nova não acompanha a animação que já estava rodando e congela onde estava (baixa demais,
  // cortando o rodapé, ou alta demais no quique final). Retoma a subida a partir dali.
  useEffect(() => {
    anim.stopAnimation((v) => {
      if (v > 0 && v !== 1) Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 10, tension: 70 }).start();
    });
  }, [anim]);

  useEffect(() => {
    if (!step) return;
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

  // Arrastar para fechar: move a própria animação de entrada (anim), assim o fundo escurecido
  // acompanha o dedo e, ao soltar, o fechamento continua de onde a folha parou.
  // (Durante o arrasto não há re-render, então recriar a cada render não interrompe o gesto.)
  const pan = useMemo(() => {
    const settle = () => Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 10, tension: 70 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => swipeToClose && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => anim.stopAnimation(),
      onPanResponderMove: (_, g) => anim.setValue(1 - Math.max(0, g.dy) / sheetHeight),
      onPanResponderRelease: (_, g) => {
        // onClose precisa animar a folha até o fim (sheet.close/dismiss); senão, desligue swipeToClose.
        if (g.dy > Math.min(140, sheetHeight * 0.25) || g.vy > 1.2) onClose();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [anim, onClose, swipeToClose, sheetHeight]);
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
  const blobLight = k?.background ?? colors.surface;
  const blobDark = k?.color ?? colors.muted;

  return (
    <View style={s.root}>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
      </Animated.View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav} pointerEvents="box-none">
        <Animated.View accessibilityViewIsModal style={[s.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
          {/* Bolhas decorativas na cor do tipo */}
          <View pointerEvents="none" style={[s.blob, { backgroundColor: blobLight, width: 180, height: 180, top: -90, right: -50 }]} />
          <View pointerEvents="none" style={[s.blob, { backgroundColor: blobLight, width: 70, height: 70, top: 28, right: 110, opacity: 0.6 }]} />
          <View pointerEvents="none" style={[s.blob, { backgroundColor: blobDark, width: 10, height: 10, top: 22, right: 86, opacity: 0.35 }]} />

          {/* Área de arrasto: alça + cabeçalho (os botões continuam recebendo toques). */}
          <View {...pan.panHandlers}>
          <View style={s.handleArea}>
            <View style={s.handle} />
          </View>
          <View style={s.header}>
            {onBack ? (
              <SheetButton icon="arrow-back" label="Voltar" onPress={onBack} />
            ) : kind ? (
              <Animated.View
                style={{
                  transform: [{ scale: iconPop }, { rotate: iconWiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) }],
                }}
              >
                <KindIcon kind={kind} size={40} />
              </Animated.View>
            ) : null}
            <Animated.View style={[{ flex: 1 }, titleStyle]}>
              <Text style={s.title} numberOfLines={2}>
                {title}
              </Text>
            </Animated.View>
            {headerRight}
            {closeButton && <SheetButton icon="close" label="Fechar" onPress={onClose} />}
          </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={[{ flexGrow: 1, gap: spacing.lg }, stepStyle]}>{children}</Animated.View>
          </ScrollView>

          {footer ? <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
          {overlay}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(61,52,46,0.5)' },
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
  handleArea: { alignItems: 'center', paddingTop: spacing.sm },
  handle: { width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: { fontFamily: fonts.serifSemiBold, fontSize: 21, color: colors.text, marginLeft: spacing.xs },
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
