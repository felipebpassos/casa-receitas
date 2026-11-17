import { Lora_400Regular, Lora_500Medium, Lora_600SemiBold, Lora_700Bold, useFonts } from '@expo-google-fonts/lora';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ConfirmHost } from '@/components/ConfirmDialog';
import { ErrorView } from '@/components/ErrorState';
import { ToastHost } from '@/components/Toast';
import { colors, fonts } from '@/components/theme';
import { Button, styles } from '@/components/ui';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { DataProvider, useData } from '@/context/DataProvider';

/** Telas apresentadas como folha (ver `Sheet`): sem cabeçalho nem animação nativa, fundo transparente. */
const SHEET_OPTIONS = {
  presentation: 'transparentModal',
  animation: 'none',
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

// Segura a splash até as fontes carregarem.
SplashScreen.preventAutoHideAsync();

function LoadingView({ status, overlay }: { status: string | null; overlay?: boolean }) {
  return (
    <View
      style={[
        styles.screen,
        styles.empty,
        overlay && { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(249,245,234,0.95)' },
      ]}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      {status && <Text style={styles.muted}>{status}</Text>}
    </View>
  );
}

function Gate() {
  const { ready, initialized, status, error, reload, reloading } = useData();
  const { userId, signOut } = useAuth();

  if (!initialized) return <LoadingView status={status} />;

  if (error && ready) {
    return (
      <View style={styles.screen}>
        <ErrorView
          error={error}
          context={{ title: 'Não foi possível carregar seus dados' }}
          onRetry={reload}
          retrying={reloading}
          forceRetry
          actions={userId ? <Button title="Sair da conta" icon="log-out-outline" variant="ghost" onPress={signOut} /> : null}
        />
      </View>
    );
  }

  // Ao entrar/sair da conta a navegação continua montada; só sobrepõe o carregamento.
  return (
    <>
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.serifSemiBold },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Receita (ver, cadastrar, editar): folhas que animam por conta própria, por cima da tela anterior. */}
      <Stack.Screen name="recipe/[id]" options={SHEET_OPTIONS} />
      <Stack.Screen name="recipe/form" options={SHEET_OPTIONS} />
      <Stack.Screen name="recipe/new" options={SHEET_OPTIONS} />
      <Stack.Screen name="user/[id]" options={{ title: 'Perfil' }} />
      <Stack.Screen name="people" options={{ title: 'Buscar amigos', headerTitleAlign: 'left' }} />
      <Stack.Screen name="account" options={{ title: 'Conta', presentation: 'modal' }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false, animation: 'none' }} />
      </Stack>
      {!ready && <LoadingView status={status} overlay />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Lora_400Regular, Lora_500Medium, Lora_600SemiBold, Lora_700Bold });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsReady) SplashScreen.hide();
  }, [fontsReady]);

  // Se a fonte falhar, segue com a do sistema em vez de travar o app.
  if (!fontsReady) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <DataProvider>
        <Gate />
        <ConfirmHost />
        <ToastHost />
      </DataProvider>
    </AuthProvider>
  );
}
