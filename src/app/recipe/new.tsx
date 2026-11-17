import { useLocalSearchParams } from 'expo-router';
import { RecipeForm } from '@/components/RecipeForm';

/** Cadastro de receita/preparo: folha em etapas por cima da tela anterior. */
export default function RecipeNewScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  return <RecipeForm initialKind={kind === 'PREP' ? 'PREP' : 'RECIPE'} />;
}
