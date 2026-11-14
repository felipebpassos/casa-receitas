import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { ProfileView, userDisplayName } from '@/components/ProfileView';
import { colors, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, Field, Input, PasswordInput, Segmented, styles } from '@/components/ui';
import { WelcomeModal } from '@/components/WelcomeModal';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { signInWithGoogle } from '@/lib/googleAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { signInSchema, signUpSchema } from '@/lib/validation';

type Mode = 'signin' | 'signup';

/**
 * Conta: login/cadastro ou perfil.
 * Com `onDone` (modal aberto no meio de uma tarefa): entrar/sair volta para onde a pessoa estava.
 * Sem `onDone` (aba Perfil): entrar leva para Receitas; criar conta mostra as boas-vindas.
 */
export function AccountView({ onDone }: { onDone?: () => void }) {
  const { userId } = useAuth();
  const { recipes } = useData();
  // Fica aqui (e não no formulário) porque, com a sessão criada, o formulário dá lugar ao perfil.
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  const goHome = () => router.navigate('/');

  const afterSignIn = () => (onDone ? onDone() : goHome());

  const welcome = welcomeName !== null && (
    <WelcomeModal
      name={welcomeName}
      primary={
        onDone
          ? { title: 'Continuar', icon: 'arrow-forward', onPress: () => (setWelcomeName(null), onDone()) }
          : { title: 'Ir para Receitas', icon: 'book-outline', onPress: () => (setWelcomeName(null), goHome()) }
      }
      secondary={
        onDone
          ? undefined
          : recipes.length === 0
            ? {
                title: 'Criar minha primeira receita',
                icon: 'add-circle-outline',
                onPress: () => {
                  setWelcomeName(null);
                  goHome();
                  router.push('/recipe/form');
                },
              }
            : { title: 'Planejar a semana', icon: 'calendar-outline', onPress: () => (setWelcomeName(null), router.navigate('/semana')) }
      }
    />
  );

  if (!isSupabaseConfigured) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>Conta indisponível</Text>
        <Text style={styles.emptySubtitle}>O app não está conectado ao servidor. Seus dados estão salvos neste celular.</Text>
      </View>
    );
  }

  return (
    <>
      {userId ? <ProfileView onSignedOut={onDone} /> : <SignInForm onSignedIn={afterSignIn} onSignedUp={setWelcomeName} />}
      {welcome}
    </>
  );
}

function SignInForm({ onSignedIn, onSignedUp }: { onSignedIn: () => void; onSignedUp: (name: string) => void }) {
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
        if (Platform.OS !== 'web') {
          toast.success('Você entrou na sua conta');
          onSignedIn();
        }
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
        onSignedIn();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: { data: { display_name: ('name' in v && v.name) || undefined } },
        });
        if (error) throw error;
        if (data.session) {
          onSignedUp(userDisplayName(data.session.user.user_metadata, v.email));
        } else {
          toast.success('Conta criada', 'Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, entre com seu e-mail e senha.', {
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
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo de 6 caracteres"
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
