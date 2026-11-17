import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, FieldError, InfoTip, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { UserFacingError } from '@/lib/errors';
import { setUsername } from '@/lib/profile';
import { normalizeUsername, usernameSchema } from '@/lib/validation';

export const USERNAME_HINT = 'Deve ser único e no mínimo 3 caracteres. Apenas letras, números, ponto e "_"';

/** Campo de usuário (normaliza: minúsculas, sem @). */
export function UsernameInput({ value, onChangeText, invalid, onSubmitEditing, autoFocus, withTip }: {
  value: string;
  onChangeText: (v: string) => void;
  invalid?: boolean;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  /** Ícone (i) com as regras dentro do campo (quando não há rótulo ao lado). */
  withTip?: boolean;
}) {
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        value={value}
        onChangeText={(t) => onChangeText(normalizeUsername(t))}
        placeholder="seu.usuario"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={20}
        invalid={invalid}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        returnKeyType="done"
        accessibilityLabel="Nome de usuário"
        style={withTip ? { paddingRight: 40 } : undefined}
      />
      {withTip && (
        <View style={s.tipInInput}>
          <InfoTip text={USERNAME_HINT} align="right" />
        </View>
      )}
    </View>
  );
}

/**
 * Escolher/trocar o nome de usuário.
 * Sem `onCancel` não fecha: é a etapa obrigatória depois do primeiro login (Google ou conta antiga).
 */
export function UsernameDialog({ initial, onCancel }: { initial: string; onCancel?: () => void }) {
  const { refreshProfile } = useAuth();
  const [value, setValue] = useState(initial);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useFormValidation(usernameSchema, { username: value });
  const error = form.errors.username ?? serverError;
  const required = !onCancel;
  const insets = useSafeAreaInsets();

  const save = async () => {
    const result = form.check();
    if (!result.ok) return;
    setSaving(true);
    try {
      const saved = await setUsername(result.value.username);
      await refreshProfile();
      toast.success(required ? 'Tudo pronto' : 'Nome de usuário alterado', saved);
      onCancel?.();
    } catch (e) {
      if (e instanceof UserFacingError) setServerError(e.message);
      else toast.error(e, { title: 'Não foi possível salvar o nome de usuário' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent={!required} animationType="fade" onRequestClose={() => onCancel?.()} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={required ? [s.screen, { paddingTop: insets.top + spacing.xl * 2, paddingBottom: insets.bottom + spacing.xl }] : s.backdrop}>
        <View accessibilityViewIsModal style={required ? s.page : s.card}>
          <Text style={[s.title, required && s.left]}>{required ? 'Escolha seu nome de usuário' : 'Nome de usuário'}</Text>
          <Text style={[s.subtitle, required && s.left]}>
            {required
              ? 'É assim que você aparece nas receitas e como seus amigos te encontram. Sugerimos um, mas você pode trocar.'
              : 'É assim que você aparece nas receitas e como seus amigos te encontram.'}
          </Text>

          <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <UsernameInput
                value={value}
                onChangeText={(v) => {
                  setValue(v);
                  setServerError(null);
                }}
                invalid={!!error}
                onSubmitEditing={save}
                autoFocus={!required}
                withTip
              />
              <FieldError message={error} />
            </View>
          </View>

          {/* Na tela cheia, o botão fica no rodapé (sobe com o teclado). */}
          <View style={[s.actions, required && s.actionsBottom]}>
            <Button title={required ? 'Continuar' : 'Salvar'} onPress={save} loading={saving} />
            {!required && <Button title="Cancelar" variant="ghost" onPress={onCancel} disabled={saving} />}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pede o usuário enquanto a pessoa logada ainda não confirmou o sugerido. */
export function UsernameGate() {
  const { userId, username, usernameConfirmed } = useAuth();
  if (!userId || !username || usernameConfirmed) return null;
  return <UsernameDialog key={userId} initial={username} />;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,52,46,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: '#3D342E',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Etapa obrigatória: tela cheia, conteúdo no topo.
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'flex-start', padding: spacing.xl },
  page: { flex: 1, width: '100%', maxWidth: 400, alignItems: 'center', gap: spacing.xs },
  actionsBottom: { marginTop: 'auto' },
  tipInInput: { position: 'absolute', right: spacing.md },
  title: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  left: { alignSelf: 'stretch', textAlign: 'left' },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.lg },
});
