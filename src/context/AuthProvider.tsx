import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Profile = { userId: string; username: string; usernameConfirmed: boolean };

type AuthState = {
  session: Session | null;
  /** null = usando sem conta (dados no celular). */
  userId: string | null;
  email: string | null;
  loading: boolean;
  /** Nome de usuário (sem @). null = sem conta ou ainda carregando. */
  username: string | null;
  /** false = gerado pelo sistema; o app pede para a pessoa confirmar/escolher. */
  usernameConfirmed: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loaded, setProfile] = useState<Profile | null>(null);
  const userId = session?.user.id ?? null;
  // Perfil de outra sessão (trocou de conta) é ignorado até o novo carregar.
  const profile = loaded && loaded.userId === userId ? loaded : null;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase.from('profiles').select('username, username_confirmed').eq('id', id).maybeSingle();
    return data ? { userId: id, username: data.username as string, usernameConfirmed: !!data.username_confirmed } : null;
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadProfile(userId).then((p) => !cancelled && setProfile(p));
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await loadProfile(userId));
  }, [userId, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        userId,
        email: session?.user.email ?? null,
        loading,
        username: profile?.username ?? null,
        // Enquanto carrega, não pede nada (evita piscar a tela de escolha).
        usernameConfirmed: profile ? profile.usernameConfirmed : true,
        refreshProfile,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
