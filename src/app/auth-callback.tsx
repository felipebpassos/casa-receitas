import { router } from 'expo-router';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';

/**
 * Destino do deep link de retorno do login com Google.
 * Quem cria a sessão é o signInWithGoogle; esta tela só sai do caminho.
 */
export default function AuthCallback() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/perfil');
  }, []);
  return <Loading />;
}
