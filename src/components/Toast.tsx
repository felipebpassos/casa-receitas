import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError, type ErrorContext } from '@/lib/errors';
import { colors, radius, spacing } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastOptions = {
  type?: ToastType;
  title: string;
  message?: string;
  /** Em ms. 0 = fica até a pessoa fechar. Padrão: 3,5 s (erros: 5 s). */
  duration?: number;
  /** Botão de ação (ex.: "Desfazer", "Tentar de novo"). Fecha o toast ao tocar. */
  action?: { label: string; onPress: () => void };
  icon?: IconName;
};

type ToastItem = Required<Pick<ToastOptions, 'type' | 'title' | 'duration'>> & Omit<ToastOptions, 'type' | 'title' | 'duration'> & { id: number };

// ------------------------------------------------------------------ store
// Fora do React para poder ser chamado de qualquer lugar (providers, libs, handlers).

const MAX_VISIBLE = 3;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function show(options: ToastOptions): number {
  const type = options.type ?? 'info';
  // Mesmo aviso repetido (ex.: várias falhas de rede seguidas) não empilha.
  const dup = items.find((t) => t.type === type && t.title === options.title && t.message === options.message);
  if (dup) dismiss(dup.id);

  const item: ToastItem = { ...options, type, duration: options.duration ?? (type === 'error' ? 5000 : 3500), id: nextId++ };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
  AccessibilityInfo.announceForAccessibility?.(options.message ? `${options.title}. ${options.message}` : options.title);
  return item.id;
}

function dismiss(id?: number) {
  items = id == null ? [] : items.filter((t) => t.id !== id);
  emit();
}

/**
 * Avisos rápidos de resultado de operações.
 *
 *   toast.success('Receita salva')
 *   toast.error(e, { title: 'Não foi possível salvar' })
 */
export const toast = {
  show,
  dismiss,
  success: (title: string, message?: string, options?: Partial<ToastOptions>) => show({ ...options, type: 'success', title, message }),
  info: (title: string, message?: string, options?: Partial<ToastOptions>) => show({ ...options, type: 'info', title, message }),
  warning: (title: string, message?: string, options?: Partial<ToastOptions>) => show({ ...options, type: 'warning', title, message }),
  /** Recebe o erro bruto e mostra a mensagem amigável (ver toAppError). */
  error: (error: unknown, context?: ErrorContext, options?: Partial<ToastOptions>) => {
    const app = toAppError(error, context);
    if (__DEV__ && app.detail) console.warn(`[${app.kind}] ${app.detail}`);
    const passing = app.kind === 'offline' || app.kind === 'timeout' || app.kind === 'rateLimit';
    return show({ ...options, type: passing ? 'warning' : 'error', title: app.title, message: app.message });
  },
};

// ------------------------------------------------------------------- view

const TONES: Record<ToastType, { fg: string; bg: string; icon: IconName }> = {
  success: { fg: colors.success, bg: colors.successLight, icon: 'checkmark-circle' },
  error: { fg: colors.danger, bg: colors.dangerLight, icon: 'alert-circle' },
  warning: { fg: colors.warning, bg: colors.warningLight, icon: 'cloud-offline' },
  info: { fg: colors.primary, bg: colors.primaryLight, icon: 'information-circle' },
};

const useNativeDriver = Platform.OS !== 'web';

function ToastCard({ item }: { item: ToastItem }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [leaving, setLeaving] = useState(false);
  const tone = TONES[item.type];

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver }).start(() => dismiss(item.id));
  };

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 8, tension: 80 }).start();
  }, [anim]);

  useEffect(() => {
    if (!item.duration) return;
    const t = setTimeout(close, item.duration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.duration]);

  return (
    <Animated.View
      style={[
        s.toast,
        { borderLeftColor: tone.fg },
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
      ]}
    >
      <Pressable onPress={close} accessibilityRole="alert" accessibilityHint="Toque para fechar" style={s.toastBody}>
        <View style={[s.icon, { backgroundColor: tone.bg }]}>
          <Ionicons name={item.icon ?? tone.icon} size={20} color={tone.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.message ? (
            <Text style={s.message} numberOfLines={4}>
              {item.message}
            </Text>
          ) : null}
        </View>
        {item.action ? (
          <Pressable
            onPress={() => {
              item.action!.onPress();
              close();
            }}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}
          >
            <Text style={[s.actionText, { color: tone.fg }]}>{item.action.label}</Text>
          </Pressable>
        ) : (
          <Ionicons name="close" size={18} color={colors.muted} />
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Renderiza os toasts. Colocar uma vez, no layout raiz, por cima da navegação. */
export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  const insets = useSafeAreaInsets();
  if (list.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[s.host, { top: insets.top + spacing.sm }]}>
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', gap: spacing.sm, zIndex: 1000, elevation: 1000 },
  toast: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#3D342E',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  icon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  message: { fontSize: 14, lineHeight: 19, color: colors.muted },
  action: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  actionText: { fontSize: 14, fontWeight: '700' },
});
