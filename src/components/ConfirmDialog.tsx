import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from './theme';
import { Button } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  /** Ação perigosa (excluir, sair): botão e ícone em vermelho. */
  destructive?: boolean;
  icon?: IconName;
  /** Se for assíncrona, o botão mostra carregamento e o diálogo só fecha ao terminar. */
  onConfirm: () => void | Promise<void>;
};

type ConfirmItem = ConfirmOptions & { id: number };

// ------------------------------------------------------------------ store
// Fora do React para poder ser chamado de qualquer handler, como o toast.

let current: ConfirmItem | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function close(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

/**
 * Pede confirmação antes de uma ação.
 *
 *   confirm({ title: 'Excluir receita', message: '...', confirmText: 'Excluir', destructive: true, onConfirm: async () => {...} })
 */
export function confirm(options: ConfirmOptions) {
  current = { ...options, id: nextId++ };
  emit();
}

// ------------------------------------------------------------------- view

const useNativeDriver = Platform.OS !== 'web';

function ConfirmCard({ item }: { item: ConfirmItem }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [busy, setBusy] = useState(false);
  const fg = item.destructive ? colors.danger : colors.primary;
  const bg = item.destructive ? colors.dangerLight : colors.primaryLight;
  const icon = item.icon ?? (item.destructive ? 'warning-outline' : 'help-circle-outline');

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 8, tension: 90 }).start();
  }, [anim]);

  const cancel = () => {
    if (!busy) close(item.id);
  };

  const accept = async () => {
    setBusy(true);
    try {
      await item.onConfirm();
    } finally {
      close(item.id);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel={item.cancelText ?? 'Cancelar'} />
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[s.card, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}
        >
          <View style={[s.icon, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={26} color={fg} />
          </View>
          <Text style={s.title}>{item.title}</Text>
          {item.message ? <Text style={s.message}>{item.message}</Text> : null}
          <View style={s.actions}>
            <Button title={item.cancelText ?? 'Cancelar'} variant="neutral" onPress={cancel} disabled={busy} style={s.actionButton} />
            <Button
              title={item.confirmText}
              variant={item.destructive ? 'destructive' : 'primary'}
              onPress={accept}
              loading={busy}
              style={s.actionButton}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Renderiza o diálogo de confirmação. Colocar uma vez, no layout raiz. */
export function ConfirmHost() {
  const item = useSyncExternalStore(subscribe, () => current, () => current);
  if (!item) return null;
  return <ConfirmCard key={item.id} item={item} />;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,52,46,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#3D342E',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  icon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { fontFamily: fonts.serifSemiBold, fontSize: 20, color: colors.text, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.md },
  actionButton: { flex: 1 },
});
