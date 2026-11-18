import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius, spacing } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: keyof typeof buttonVariants;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={v.fg} />}
          <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.card, fg: colors.primary, border: colors.primary },
  danger: { bg: colors.card, fg: colors.danger, border: colors.danger },
  /** Confirmação de ação perigosa (preenchido). */
  destructive: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  /** Ação perigosa discreta (ex.: excluir no fim da tela). */
  dangerGhost: { bg: 'transparent', fg: colors.danger, border: 'transparent' },
  neutral: { bg: colors.card, fg: colors.text, border: colors.border },
};

export function IconButton({
  name,
  onPress,
  color = colors.muted,
  size = 22,
  label,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  label: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={({ pressed }) => pressed && { opacity: 0.5 }}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

const TIP_WIDTH = 240;

/**
 * Ícone (?) que mostra uma explicação curta num balão ao tocar.
 * O balão fica numa camada por cima de tudo (não some atrás dos campos); tocar fora fecha.
 */
export function InfoTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { width: screenW } = useWindowDimensions();

  // Mede o ícone tocado (mesmo jeito do DropdownMenu).
  const open = (e: GestureResponderEvent) => {
    const target = e.currentTarget;
    if (typeof target === 'number') return;
    target.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };
  const close = () => setAnchor(null);

  const left = anchor
    ? Math.min(Math.max((align === 'right' ? anchor.x + anchor.w + 6 - TIP_WIDTH : anchor.x - 6), spacing.sm), screenW - TIP_WIDTH - spacing.sm)
    : 0;

  return (
    <>
      <Pressable
        onPress={anchor ? close : open}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Ajuda"
        accessibilityHint={text}
      >
        <Ionicons name="help-circle-outline" size={16} color={anchor ? colors.primary : colors.muted} />
      </Pressable>
      {anchor && (
        <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fechar ajuda" />
          <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.tip, { top: anchor.y + anchor.h + 6, left }]}>
            <Text style={styles.tipText}>{text}</Text>
          </View>
        </Modal>
      )}
    </>
  );
}

export function Field({
  label,
  error,
  hint,
  tooltip,
  optional,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  /** Explicação no ícone (i) ao lado do rótulo, em vez de texto fixo embaixo. */
  tooltip?: string;
  /** Mostra "(opcional)" ao lado do rótulo. */
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.row, { gap: spacing.xs }]}>
        <Text style={[styles.label, !!error && { color: colors.danger }]}>
          {label}
          {optional && <Text style={{ textTransform: 'none', fontWeight: '400' }}> (opcional)</Text>}
        </Text>
        {tooltip && <InfoTip text={tooltip} />}
      </View>
      {children}
      {error ? <FieldError message={error} /> : hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

/** Mensagem de validação embaixo de um campo. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={[styles.row, { gap: spacing.xs }]} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={styles.fieldError}>{message}</Text>
    </View>
  );
}

export function Input({ invalid, ...props }: TextInputProps & { invalid?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      aria-invalid={invalid}
      {...props}
      style={[styles.input, invalid && styles.inputInvalid, props.style]}
    />
  );
}

/** Campo de senha com botão de olho para mostrar/ocultar o texto. */
export function PasswordInput(props: Omit<TextInputProps, 'secureTextEntry'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input {...props} secureTextEntry={!visible} style={[{ paddingRight: 52 }, props.style]} />
      <View style={{ position: 'absolute', right: spacing.lg }}>
        <IconButton
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          size={20}
          onPress={() => setVisible((v) => !v)}
        />
      </View>
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus,
  autoCapitalize,
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  /** Tecla "buscar" do teclado. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.search, style]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoCorrect={false}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {value.length > 0 && <IconButton name="close-circle" label="Limpar busca" size={18} onPress={() => onChangeText('')} />}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            {o.icon && <Ionicons name={o.icon} size={16} color={active ? colors.primary : colors.muted} />}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TOGGLE = { width: 52, height: 32, thumb: 26, pad: 3 };

/**
 * Interruptor liga/desliga com o mesmo visual em todas as plataformas
 * (o Switch nativo quase some no fundo claro, principalmente na web).
 * Sem `onChange` ele é só visual: use dentro de uma linha inteira clicável.
 */
export function Toggle({ value, onChange }: { value: boolean; onChange?: (v: boolean) => void }) {
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [anim, value]);

  const track = (
    <Animated.View
      style={[
        styles.toggleTrack,
        { backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [colors.toggleOff, colors.primary] }) },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, TOGGLE.width - TOGGLE.thumb - TOGGLE.pad * 2] }) }] },
        ]}
      />
    </Animated.View>
  );
  if (!onChange) return track;
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      {track}
    </Pressable>
  );
}

/** Barra fixa no rodapé para as ações principais da tela. */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{children}</View>;
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Ionicons name="checkmark" size={16} color={colors.onPrimary} />}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove && <IconButton name="close" size={16} label={`Remover ${label}`} onPress={onRemove} />}
    </Pressable>
  );
}

/** Seletor horizontal de opções (ex.: unidades). */
export function ChipSelect({ options, value, onChange }: { options: readonly string[]; value: string | null; onChange: (v: string) => void }) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  // A opção selecionada vai para a frente; ao mudar a seleção, volta a rolagem ao início para ela ficar visível.
  const ordered = value && options.includes(value) ? [value, ...options.filter((o) => o !== value)] : options;
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [value]);
  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }} keyboardShouldPersistTaps="handled">
      {ordered.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

const badgeTones = {
  neutral: { bg: colors.surface, fg: colors.muted },
  success: { bg: colors.successLight, fg: colors.success },
  accent: { bg: colors.accentLight, fg: colors.accent },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof badgeTones }) {
  const { bg, fg } = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  title: { fontSize: 24, fontFamily: fonts.serifBold, color: colors.text },
  subtitle: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tip: {
    position: 'absolute',
    width: TIP_WIDTH,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    shadowColor: '#3D342E',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tipText: { fontSize: 13, lineHeight: 18, color: colors.background },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  inputInvalid: { borderColor: colors.danger, backgroundColor: '#FFF8F6' },
  fieldError: { flex: 1, fontSize: 13, color: colors.danger },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card, elevation: 1 },
  segmentText: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  segmentTextActive: { color: colors.text, fontWeight: '700' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  toggleTrack: { width: TOGGLE.width, height: TOGGLE.height, borderRadius: radius.pill, padding: TOGGLE.pad, justifyContent: 'center' },
  toggleThumb: {
    width: TOGGLE.thumb,
    height: TOGGLE.thumb,
    borderRadius: TOGGLE.thumb / 2,
    backgroundColor: colors.onPrimary,
    boxShadow: '0 1px 3px rgba(61, 52, 46, 0.35)',
  },
  bottomBar: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
