import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { UserFacingError } from './errors';
import { supabase } from './supabase';

/**
 * Endereço para onde o Supabase devolve a pessoa depois do login.
 * Precisa estar na lista de redirects permitidos do Supabase (ver README).
 * Build: receitasdecasa://auth-callback · Expo Go: exp://<ip>:8081/--/auth-callback · Web: <origem>/perfil
 */
export function authRedirectUrl() {
  return Linking.createURL(Platform.OS === 'web' ? 'perfil' : 'auth-callback');
}

/**
 * Login com Google via navegador (funciona no Expo Go, em builds e na web).
 * Retorna false se a pessoa fechou o navegador sem entrar; lança erro se falhar.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = authRedirectUrl();

  if (Platform.OS === 'web') {
    // A página vai para o Google e volta com a sessão na URL (detectSessionInUrl).
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
    return true;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  await createSessionFromUrl(result.url);
  return true;
}

/** Lê a sessão devolvida no redirect: tokens no fragmento (#) ou código PKCE (?code=). */
async function createSessionFromUrl(url: string) {
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) new URLSearchParams(part).forEach((v, k) => params.set(k, v));

  const failure = params.get('error_description') ?? params.get('error');
  if (failure) throw new Error(failure);

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new UserFacingError('O login não retornou uma sessão. Tente de novo.', undefined, 'unknown');
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}
