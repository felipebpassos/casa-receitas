import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { toAppError, type AppError, type ErrorContext, type ErrorKind } from '@/lib/errors';
import { colors, fonts, radius, spacing } from './theme';
import { Button } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<ErrorKind, IconName> = {
  offline: 'cloud-offline-outline',
  timeout: 'time-outline',
  credentials: 'key-outline',
  session: 'log-in-outline',
  permission: 'lock-closed-outline',
  notFound: 'search-outline',
  conflict: 'copy-outline',
  rateLimit: 'hourglass-outline',
  validation: 'alert-circle-outline',
  server: 'server-outline',
  unknown: 'warning-outline',
};

/** Falhas passageiras (rede, lentidão) usam tom de aviso; o resto, tom de erro. */
function toneOf(kind: ErrorKind) {
  return kind === 'offline' || kind === 'timeout' || kind === 'rateLimit'
    ? { fg: colors.warning, bg: colors.warningLight }
    : { fg: colors.danger, bg: colors.dangerLight };
}

type ContentProps = {
  /** Erro bruto (Error, erro do Supabase, string...) ou AppError já resolvido. */
  error?: unknown;
  /** Contexto da ação, usado para personalizar o título (ex.: "Não foi possível salvar"). */
  context?: ErrorContext;
  /** Sobrescreve o título calculado. */
  title?: string;
  /** Sobrescreve a mensagem calculada. */
  message?: string;
  /** Sobrescreve o ícone calculado. */
  icon?: IconName;
  /**
   * Ação de "Tentar de novo". Se devolver uma Promise, o botão mostra carregando até ela terminar.
   * Só aparece quando o erro é do tipo que vale tentar de novo (ou quando `forceRetry`).
   */
  onRetry?: () => unknown;
  /** Carregamento controlado por fora (ex.: o fetch reiniciado por um `tick`). */
  retrying?: boolean;
  /** Mostra o botão de tentar de novo mesmo para erros não recuperáveis. */
  forceRetry?: boolean;
  /** Texto do botão de tentar de novo. */
  retryLabel?: string;
  /** Permite ver a mensagem técnica original. Padrão: só em desenvolvimento. */
  showDetails?: boolean;
};

function useResolved({ error, context, title, message, icon }: ContentProps) {
  const app: AppError = toAppError(error ?? null, context);
  return {
    app,
    title: title ?? app.title,
    message: message ?? app.message,
    icon: icon ?? ICONS[app.kind],
    tone: toneOf(app.kind),
  };
}

/** Executa o retry e acompanha a Promise devolvida (se houver). */
function useRetry(onRetry: (() => unknown) | undefined, retrying: boolean | undefined) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const run = useCallback(async () => {
    if (!onRetry || busy) return;
    const result = onRetry();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setBusy(true);
      try {
        await result;
      } catch {
        // Quem chamou já trata o erro (normalmente atualizando o próprio `error`).
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
  }, [onRetry, busy]);

  return { busy: busy || !!retrying, run };
}

function Details({ detail, color, center }: { detail: string; color: string; center?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs, alignSelf: 'stretch' }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[s.detailsToggle, { alignSelf: center ? 'center' : 'flex-start' }]}
      >
        <Text style={[s.detailsToggleText, { color }]}>{open ? 'Ocultar detalhes' : 'Ver detalhes'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={color} />
      </Pressable>
      {open && (
        <Text selectable style={s.detailsText}>
          {detail}
        </Text>
      )}
    </View>
  );
}

/**
 * Aviso de erro em linha, para o topo de listas e seções.
 * Mantém o conteúdo da tela visível (ex.: resultados antigos) e oferece "Tentar de novo".
 */
export function ErrorBanner({
  onDismiss,
  style,
  ...props
}: ContentProps & {
  /** Mostra um "x" para dispensar o aviso. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { app, title, message, icon, tone } = useResolved(props);
  const { busy, run } = useRetry(props.onRetry, props.retrying);
  const canRetry = !!props.onRetry && (app.retryable || props.forceRetry);
  const showDetails = (props.showDetails ?? __DEV__) && !!app.detail;

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.banner, { backgroundColor: tone.bg, borderColor: tone.fg + '33' }, style]}>
      <View style={[s.bannerIcon, { backgroundColor: tone.fg + '1A' }]}>
        <Ionicons name={icon} size={20} color={tone.fg} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Text style={[s.bannerTitle, { color: tone.fg }]}>{title}</Text>
          {onDismiss && (
            <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dispensar aviso" style={({ pressed }) => pressed && { opacity: 0.5 }}>
              <Ionicons name="close" size={18} color={tone.fg} />
            </Pressable>
          )}
        </View>
        <Text style={s.bannerMessage}>{message}</Text>

        {canRetry && (
          <Pressable
            onPress={run}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            style={({ pressed }) => [s.retryChip, { borderColor: tone.fg }, (pressed || busy) && { opacity: 0.7 }]}
          >
            {busy ? <ActivityIndicator size="small" color={tone.fg} /> : <Ionicons name="refresh" size={15} color={tone.fg} />}
            <Text style={[s.retryChipText, { color: tone.fg }]}>{busy ? 'Tentando...' : props.retryLabel ?? 'Tentar de novo'}</Text>
          </Pressable>
        )}
        {showDetails && (
          <View style={{ marginTop: spacing.xs }}>
            <Details detail={app.detail!} color={colors.muted} />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Estado de erro de tela inteira (ou de uma área vazia), para quando não há nada para mostrar.
 * `actions` recebe botões extras (ex.: "Sair da conta").
 */
export function ErrorView({
  actions,
  fill = true,
  style,
  ...props
}: ContentProps & {
  actions?: ReactNode;
  /** Ocupa o espaço disponível e centraliza (padrão). Desligue dentro de listas. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { app, title, message, icon, tone } = useResolved(props);
  const { busy, run } = useRetry(props.onRetry, props.retrying);
  const canRetry = !!props.onRetry && (app.retryable || props.forceRetry);
  const showDetails = (props.showDetails ?? __DEV__) && !!app.detail;

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.view, fill && { flex: 1 }, style]}>
      <View style={[s.viewIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={icon} size={36} color={tone.fg} />
      </View>
      <View style={{ gap: spacing.xs, alignItems: 'center' }}>
        <Text style={s.viewTitle}>{title}</Text>
        <Text style={s.viewMessage}>{message}</Text>
      </View>
      {(canRetry || actions) && (
        <View style={s.viewActions}>
          {canRetry && <Button title={props.retryLabel ?? 'Tentar de novo'} icon="refresh" loading={busy} onPress={run} />}
          {actions}
        </View>
      )}
      {showDetails && (
        <View style={{ maxWidth: 360, width: '100%' }}>
          <Details detail={app.detail!} color={colors.muted} center />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  bannerMessage: { fontSize: 14, lineHeight: 20, color: colors.text },
  retryChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.card,
  },
  retryChipText: { fontSize: 14, fontWeight: '600' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailsToggleText: { fontSize: 13, fontWeight: '500' },
  detailsText: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  view: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  viewIcon: { width: 80, height: 80, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  viewTitle: { fontSize: 19, fontFamily: fonts.serifSemiBold, color: colors.text, textAlign: 'center' },
  viewMessage: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  viewActions: { width: '100%', maxWidth: 320, gap: spacing.sm },
});
