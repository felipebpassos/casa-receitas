import { router } from 'expo-router';
import { AccountView } from '@/components/AccountView';

/** Conta em modal (ex.: aberta a partir do formulário de receita): fecha ao entrar/sair. */
export default function AccountModal() {
  return <AccountView onDone={() => router.back()} />;
}
