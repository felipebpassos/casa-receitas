import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { colors, spacing } from '@/components/theme';
import { Button, Field, Input, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

export default function AccountScreen() {
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
          <Ionicons name="cloud-done-outline" size={56} color={colors.primary} />
          <Text style={styles.subtitle}>{email}</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Suas receitas, sua despensa e sua semana estão salvas na sua conta.
          </Text>
        </View>
        <Button
          title="Sair da conta"
          icon="log-out-outline"
          variant="danger"
          onPress={() =>
            Alert.alert('Sair', 'Seus dados continuam salvos na conta. Neste celular, o app volta a funcionar sem conta.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sair',
                style: 'destructive',
                onPress: async () => {
                  await signOut();
                  router.back();
                },
              },
            ])
          }
        />
      </ScrollView>
    );
  }

  return <SignInForm />;
}

function SignInForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Dados incompletos', 'Informe um e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.back();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (data.session) {
          router.back();
        } else {
          Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação. Depois de confirmar, entre com seu e-mail e senha.');
          setMode('signin');
        }
      }
    } catch (e) {
      Alert.alert('Não foi possível continuar', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="cloud-upload-outline" size={56} color={colors.primary} />
        <Text style={styles.subtitle}>Você está usando sem conta</Text>
        <Text style={[styles.muted, { textAlign: 'center', fontSize: 14 }]}>
          Seus dados estão salvos só neste celular. Entre para fazer backup, usar em outro aparelho e publicar receitas. Tudo o que você já cadastrou vai junto para a conta.
        </Text>
      </View>

      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'signin', label: 'Entrar' },
          { value: 'signup', label: 'Criar conta' },
        ]}
      />

      {mode === 'signup' && (
        <Field label="Seu nome">
          <Input value={name} onChangeText={setName} placeholder="Aparece nas receitas que você publicar" autoCapitalize="words" />
        </Field>
      )}
      <Field label="E-mail">
        <Input value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      </Field>
      <Field label="Senha">
        <Input value={password} onChangeText={setPassword} placeholder="Mínimo de 6 caracteres" secureTextEntry autoCapitalize="none" />
      </Field>

      <Button title={mode === 'signin' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={loading} />
    </ScrollView>
  );
}
