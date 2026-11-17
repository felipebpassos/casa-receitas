import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { NewRecipeDialog } from '@/components/NewRecipeDialog';
import { RecipeListItem } from '@/components/RecipeListItem';
import { KIND, KIND_FILTERS, type KindFilter } from '@/components/RecipeKind';
import { colors, radius, spacing } from '@/components/theme';
import { Chip, EmptyState, SearchBar, Segmented, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { computeGroups, countItems, normalizeSearch } from '@/lib/shopping';
import type { Recipe } from '@/lib/types';

/** Minhas: criadas por você. Salvas: cópias de receitas de outras pessoas. */
type Scope = 'mine' | 'saved';

export default function RecipesScreen() {
  // Atalhos de outras telas podem abrir um escopo específico (ex.: ?tab=saved).
  // ?tab=new abre Minhas já com a escolha de Receita/Preparo para cadastrar.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const requested = tabParam === 'mine' || tabParam === 'saved' ? tabParam : tabParam === 'new' ? 'mine' : null;
  const [scope, setScope] = useState<Scope>(requested ?? 'mine');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(tabParam === 'new');
  const [seenParam, setSeenParam] = useState(tabParam);
  if (tabParam !== seenParam) {
    setSeenParam(tabParam);
    if (requested) setScope(requested);
    if (tabParam === 'new') setCreating(true);
  }
  // Limpa o parâmetro para que o mesmo atalho funcione de novo depois.
  useEffect(() => {
    if (tabParam) router.setParams({ tab: undefined });
  }, [tabParam]);
  // Ao trocar para outra aba do menu, volta para Minhas: quem retorna sempre começa pelas próprias receitas.
  // Feito na saída (não na volta) para não sobrescrever um atalho como ?tab=saved.
  // Abrir uma receita por cima não conta: a aba ativa continua sendo esta.
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(
      () => () => {
        const { routes, index } = navigation.getState() ?? {};
        if (routes && index != null && routes[index]?.name !== 'index') setScope('mine');
      },
      [navigation],
    ),
  );

  return (
    <View style={styles.screen}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: 'Minhas', icon: 'book-outline' },
            { value: 'saved', label: 'Salvas', icon: 'bookmark-outline' },
          ]}
        />
        <SearchBar value={query} onChangeText={setQuery} placeholder={scope === 'saved' ? 'Buscar nas salvas...' : 'Buscar nas suas receitas...'} />
      </View>

      <CollectionList query={query} scope={scope} />

      {/* Criar só faz sentido em Minhas: Salvas são receitas de outras pessoas. */}
      {scope === 'mine' && (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel="Cadastrar receita ou preparo"
          style={({ pressed }) => ({
            position: 'absolute',
            right: spacing.lg,
            bottom: spacing.lg,
            width: 60,
            height: 60,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </Pressable>
      )}

      <NewRecipeDialog
        visible={creating}
        onClose={() => setCreating(false)}
        onSelect={(kind) => {
          setCreating(false);
          router.push({ pathname: '/recipe/new', params: { kind } });
        }}
      />
    </View>
  );
}

/** Lista do caderno no escopo escolhido (salvas são somente leitura). */
function CollectionList({ query, scope }: { query: string; scope: Scope }) {
  const { recipes, ingredientName, getRecipe, needsContext } = useData();
  const [filter, setFilter] = useState<KindFilter>('ALL');

  const inScope = useMemo(() => recipes.filter((r) => !!r.originRecipeId === (scope === 'saved')), [recipes, scope]);

  const list = useMemo(() => {
    const q = normalizeSearch(query);
    return inScope.filter(
      (r) =>
        (filter === 'ALL' || r.kind === filter) &&
        (!q ||
          normalizeSearch(r.name).includes(q) ||
          r.items.some((i) => {
            const name = i.ingredientId ? ingredientName(i.ingredientId) : i.subRecipeId ? getRecipe(i.subRecipeId)?.name ?? '' : '';
            return normalizeSearch(name).includes(q);
          })),
    );
  }, [inScope, query, filter, ingredientName, getRecipe]);

  const empty = (() => {
    if (query) return <EmptyState icon="search" title="Nada encontrado" subtitle={`Nada com "${query}" no nome ou nos ingredientes.`} />;
    if (scope === 'saved') {
      if (filter === 'RECIPE') return <EmptyState icon={KIND.RECIPE.icon} title="Nenhuma receita salva" subtitle="Encontre receitas de outras pessoas em Explorar." />;
      if (filter === 'PREP') return <EmptyState icon={KIND.PREP.icon} title="Nenhum preparo salvo" subtitle="Encontre preparos de outras pessoas em Explorar." />;
      return <EmptyState icon="bookmark-outline" title="Nada salvo ainda" subtitle="Encontre receitas de outras pessoas em Explorar e salve no seu caderno." />;
    }
    if (filter === 'RECIPE') return <EmptyState icon={KIND.RECIPE.icon} title="Nenhuma receita ainda" subtitle={`Toque em + e escolha Receita. Ex.: ${KIND.RECIPE.examples}`} />;
    if (filter === 'PREP') return <EmptyState icon={KIND.PREP.icon} title="Nenhum preparo ainda" subtitle={`Toque em + e escolha Preparo. Ex.: ${KIND.PREP.examples}`} />;
    return <EmptyState icon="book-outline" title="Nenhuma receita sua ainda" subtitle="Toque em + para cadastrar uma receita ou um preparo." />;
  })();

  return (
    <View style={{ flex: 1 }}>
      {inScope.length > 0 && (
        <View style={[styles.row, { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]} accessibilityRole="tablist">
          {KIND_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </View>
      )}
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <RecipeCard recipe={item} itemCount={countItems(computeGroups([item.id], needsContext))} />}
        ListEmptyComponent={empty}
      />
    </View>
  );
}

function RecipeCard({ recipe, itemCount }: { recipe: Recipe; itemCount: number }) {
  return (
    <RecipeListItem
      id={recipe.id}
      kind={recipe.kind}
      name={recipe.name}
      itemCount={itemCount}
      author={recipe.originRecipeId ? (recipe.originAuthorName ?? 'usuário') : null}
    />
  );
}
