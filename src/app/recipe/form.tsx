import { Redirect, useLocalSearchParams } from 'expo-router';
import { RecipeForm } from '@/components/RecipeForm';
import { EmptyState } from '@/components/ui';
import { useData } from '@/context/DataProvider';

/** Edição de receita/preparo. O cadastro fica em /recipe/new. */
export default function RecipeEditScreen() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { getRecipe } = useData();
  const existing = id ? getRecipe(id) : undefined;
  if (!existing) return <Redirect href={{ pathname: '/recipe/new', params: kind ? { kind } : {} }} />;
  // Receitas salvas de outras pessoas são somente leitura.
  if (existing.originRecipeId) {
    return <EmptyState icon="lock-closed-outline" title="Receita somente leitura" subtitle="Receitas salvas de outras pessoas não podem ser editadas." />;
  }
  return <RecipeForm existing={existing} />;
}
