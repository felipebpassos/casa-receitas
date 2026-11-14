import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, !!error && { color: colors.danger }]}>{label}</Text>
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
      <Input {...props} secureTextEntry={!visible} style={[{ paddingRight: 44 }, props.style]} />
      <View style={{ position: 'absolute', right: spacing.sm }}>
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

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoCorrect={false}
        returnKeyType="search"
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
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }} keyboardShouldPersistTaps="handled">
      {options.map((o) => (
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
});
