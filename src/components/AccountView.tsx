import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { colors, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, Field, Input, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { signInWithGoogle } from '@/lib/googleAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signInSchema, signUpSchema } from '@/lib/validation';

type Mode = 'signin' | 'signup';

/**
 * Conta: login/cadastro ou dados da conta.
 * `onDone` é chamado após entrar/sair (no modal, fecha; na aba Perfil, não precisa).
 */
export function AccountView({ onDone }: { onDone?: () => void }) {
  const { userId, email, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>Conta indisponível</Text>
        <Text style={styles.emptySubtitle}>O app não está conectado ao servidor. Seus dados estão salvos neste celular.</Text>
      </View>
    );
  }

  if (userId) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="cloud-done-outline" size={56} color={colors.success} />
          <Text style={styles.subtitle}>{email}</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Suas receitas, sua semana e sua lista de compras estão salvas na sua conta.
          </Text>
        </View>
        <Button
          title="Sair da conta"
          icon="log-out-outline"
          variant="danger"
          onPress={() =>
            confirm({
              title: 'Sair',
              message: 'Seus dados continuam salvos na conta. Neste celular, o app volta a funcionar sem conta.',
              confirmText: 'Sair',
              destructive: true,
              onConfirm: async () => {
                await signOut();
                toast.info('Você saiu da conta', 'Neste celular, o app volta a funcionar sem conta.');
                onDone?.();
              },
            })
          }
        />
      </ScrollView>
    );
  }

  return <SignInForm onDone={onDone} />;
}

function SignInForm({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useFormValidation(mode === 'signin' ? signInSchema : signUpSchema, { name, email, password });
  const { errors } = form;

  const changeMode = (m: Mode) => {
    setMode(m);
    form.reset();
  };

  const google = async () => {
    setGoogleLoading(true);
    try {
      if (await signInWithGoogle()) {
        // Na web a página sai para o Google; o aviso aparece só no app.
        if (Platform.OS !== 'web') toast.success('Você entrou na sua conta');
        onDone?.();
      }
    } catch (e) {
      toast.error(e, { title: 'Não foi possível entrar com Google' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const submit = async () => {
    const result = form.check();
    if (!result.ok) return;
    const v = result.value;
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
        if (error) throw error;
        toast.success('Você entrou na sua conta');
        onDone?.();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: { data: { display_name: ('name' in v && v.name) || undefined } },
        });
        if (error) throw error;
        if (data.session) {
          toast.success('Conta criada', 'Suas receitas agora ficam salvas na nuvem.');
          onDone?.();
        } else {
          toast.info('Confirme seu e-mail', 'Enviamos um link de confirmação. Depois de confirmar, entre com seu e-mail e senha.', {
            icon: 'mail-outline',
            duration: 8000,
          });
          changeMode('signin');
        }
      }
    } catch (e) {
      toast.error(e, { title: mode === 'signin' ? 'Não foi possível entrar' : 'Não foi possível criar a conta' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center' }}>
        <Image source={require('../../assets/logo.png')} style={{ width: 180, height: 175 }} resizeMode="contain" accessibilityLabel="Receitas de Casa" />
      </View>

      <Segmented<Mode>
        value={mode}
        onChange={changeMode}
        options={[
          { value: 'signin', label: 'Entrar' },
          { value: 'signup', label: 'Criar conta' },
        ]}
      />

      {mode === 'signup' && (
        <Field label="Nome" error={errors.name}>
          <Input value={name} onChangeText={setName} placeholder="Digite seu nome" autoCapitalize="words" invalid={!!errors.name} maxLength={60} />
        </Field>
      )}
      <Field label="E-mail" error={errors.email}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          invalid={!!errors.email}
        />
      </Field>
      <Field label="Senha" error={errors.password}>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo de 6 caracteres"
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          invalid={!!errors.password}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
      </Field>

      <Button title={mode === 'signin' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={loading} disabled={googleLoading} />

      <View style={styles.row}>
        <View style={[styles.separator, { flex: 1 }]} />
        <Text style={styles.muted}>ou</Text>
        <View style={[styles.separator, { flex: 1 }]} />
      </View>

      <Button title="Continuar com Google" icon="logo-google" variant="neutral" onPress={google} loading={googleLoading} disabled={loading} />

      <Text style={[styles.muted, { textAlign: 'center', marginTop: spacing.sm }]}>
        Entre na sua conta para salvar e compartilhar suas receitas.
      </Text>
    </ScrollView>
  );
}
