import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { NewRecipeDialog } from '@/components/NewRecipeDialog';
import { RecipeListItem } from '@/components/RecipeListItem';
import { KIND } from '@/components/RecipeKind';
import { activeFilterCount, DEFAULT_FILTERS, FilterButton, FilterPanel, type RecipeFilters } from '@/components/RecipeFilters';
import { colors, radius, spacing } from '@/components/theme';
import { EmptyState, SearchBar, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { computeGroups, countItems, normalizeSearch } from '@/lib/shopping';
import type { Recipe } from '@/lib/types';

export default function RecipesScreen() {
  // Atalhos de outras telas: ?tab=mine / ?tab=saved jÃ¡ abrem filtrando pela origem;
  // ?tab=new abre a escolha de Receita/Preparo para cadastrar.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const requestedOrigin = tabParam === 'mine' ? 'MINE' : tabParam === 'saved' ? 'SAVED' : null;
  const [filters, setFilters] = useState<RecipeFilters>(
    requestedOrigin ? { ...DEFAULT_FILTERS, origin: requestedOrigin } : DEFAULT_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(tabParam === 'new');
  const [seenParam, setSeenParam] = useState(tabParam);
  if (tabParam !== seenParam) {
    setSeenParam(tabParam);
    if (requestedOrigin) setFilters((f) => ({ ...f, origin: requestedOrigin }));
    if (tabParam === 'new') setCreating(true);
  }
  // Limpa o parÃ¢metro para que o mesmo atalho funcione de novo depois.
  useEffect(() => {
    if (tabParam) router.setParams({ tab: undefined });
  }, [tabParam]);
  // Ao trocar para outra aba do menu, desfaz o filtro de origem (vindo de um atalho, por exemplo):
  // quem retorna vÃª o caderno inteiro. Feito na saÃ­da para nÃ£o sobrescrever um atalho como ?tab=saved.
  // Abrir uma receita por cima nÃ£o conta: a aba ativa continua sendo esta.
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(
      () => () => {
        const { routes, index } = navigation.getState() ?? {};
        if (routes && index != null && routes[index]?.name !== 'index') setFilters((f) => ({ ...f, origin: 'ALL' }));
      },
      [navigation],
    ),
  );

  const list = useFilteredRecipes(query, filters);

  return (
    <View style={styles.screen}>
      <View style={[styles.row, { padding: spacing.lg }]}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar no seu caderno..." style={{ flex: 1 }} />
        <FilterButton count={activeFilterCount(filters)} onPress={() => setFiltersOpen(true)} />
      </View>

      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        ListEmptyComponent={<Empty query={query} filters={filters} />}
      />

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
          // Sombra suave na cor da marca (boxShadow funciona igual no Android, iOS e web).
          boxShadow: pressed
            ? '0 2px 6px rgba(200, 96, 58, 0.35)'
            : '0 8px 20px rgba(200, 96, 58, 0.35), 0 2px 6px rgba(61, 52, 46, 0.15)',
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </Pressable>

      <FilterPanel visible={filtersOpen} value={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} resultCount={list.length} />

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

/** Caderno inteiro (prÃ³prias e salvas, em ordem alfabÃ©tica) com busca e filtros aplicados. */
function useFilteredRecipes(query: string, { kind, origin }: RecipeFilters) {
  const { recipes, ingredientName, getRecipe } = useData();
  return useMemo(() => {
    const q = normalizeSearch(query);
    return recipes.filter(
      (r) =>
        (kind === 'ALL' || r.kind === kind) &&
        (origin === 'ALL' || !!r.originRecipeId === (origin === 'SAVED')) &&
        (!q ||
          normalizeSearch(r.name).includes(q) ||
          r.items.some((i) => {
            const name = i.ingredientId ? ingredientName(i.ingredientId) : i.subRecipeId ? (getRecipe(i.subRecipeId)?.name ?? '') : '';
            return normalizeSearch(name).includes(q);
          })),
    );
  }, [recipes, query, kind, origin, ingredientName, getRecipe]);
}

function Empty({ query, filters: { kind, origin } }: { query: string; filters: RecipeFilters }) {
  if (query) return <EmptyState icon="search" title="Nada encontrado" subtitle={`Nada com "${query}" no nome ou nos ingredientes.`} />;
  if (origin === 'SAVED') {
    const title = { ALL: 'Nada salvo ainda', RECIPE: 'Nenhuma receita salva', PREP: 'Nenhum preparo salvo' }[kind];
    return (
      <EmptyState
        icon={kind === 'ALL' ? 'bookmark-outline' : KIND[kind].icon}
        title={title}
        subtitle="Encontre receitas de outras pessoas em Explorar e salve no seu caderno."
      />
    );
  }
  if (origin === 'MINE' && kind === 'ALL') {
    return <EmptyState icon="book-outline" title="Nenhuma receita sua ainda" subtitle="Toque em + para cadastrar uma receita ou um preparo." />;
  }
  if (kind !== 'ALL') {
    return (
      <EmptyState
        icon={KIND[kind].icon}
        title={kind === 'RECIPE' ? 'Nenhuma receita ainda' : 'Nenhum preparo ainda'}
        subtitle={`Toque em + e escolha ${KIND[kind].label}. Ex.: ${KIND[kind].examples}`}
      />
    );
  }
  return <EmptyState icon="book-outline" title="Seu caderno estÃ¡ vazio" subtitle="Toque em + para cadastrar uma receita ou salve receitas de outras pessoas em Explorar." />;
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { needsContext } = useData();
  const itemCount = useMemo(() => countItems(computeGroups([recipe.id], needsContext)), [recipe.id, needsContext]);
  return (
    <RecipeListItem
      id={recipe.id}
      kind={recipe.kind}
      name={recipe.name}
      itemCount={itemCount}
      author={recipe.originRecipeId ? (recipe.originAuthorName ?? 'usuÃ¡rio') : null}
    />
  );
}
