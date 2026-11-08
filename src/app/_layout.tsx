import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors, spacing } from '@/components/theme';
import { Button, styles } from '@/components/ui';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { DataProvider, useData } from '@/context/DataProvider';

function LoadingView({ status, overlay }: { status: string | null; overlay?: boolean }) {
  return (
    <View
      style={[
        styles.screen,
        styles.empty,
        overlay && { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(250,250,247,0.95)' },
      ]}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      {status && <Text style={styles.muted}>{status}</Text>}
    </View>
  );
}

function Gate() {
  const { ready, initialized, status, error, reload } = useData();
  const { userId, signOut } = useAuth();

  if (!initialized) return <LoadingView status={status} />;

  if (error && ready) {
    return (
      <View style={[styles.screen, styles.empty, { gap: spacing.md }]}>
        <Text style={styles.emptyTitle}>Não foi possível carregar seus dados</Text>
        <Text style={styles.emptySubtitle}>{error}</Text>
        <Button title="Tentar de novo" icon="refresh" onPress={reload} />
        {userId && <Button title="Sair da conta" variant="ghost" onPress={signOut} />}
      </View>
    );
  }

  // Ao entrar/sair da conta a navegação continua montada; só sobrepõe o carregamento.
  return (
    <>
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: 'Receita' }} />
      <Stack.Screen name="recipe/form" options={{ title: 'Receita', presentation: 'modal' }} />
      <Stack.Screen name="account" options={{ title: 'Conta', presentation: 'modal' }} />
      </Stack>
      {!ready && <LoadingView status={status} overlay />}
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <DataProvider>
        <Gate />
      </DataProvider>
    </AuthProvider>
  );
}
