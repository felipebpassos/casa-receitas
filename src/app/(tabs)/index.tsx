import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorBanner, ErrorView } from '@/components/ErrorState';
import { NewRecipeDialog } from '@/components/NewRecipeDialog';
import { RecipeListItem } from '@/components/RecipeListItem';
import { KIND } from '@/components/RecipeKind';
import { colors, radius, spacing } from '@/components/theme';
import { Chip, EmptyState, Loading, SearchBar, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { searchPublicRecipes } from '@/lib/publicLibrary';
import { computeGroups, countItems, normalizeSearch } from '@/lib/shopping';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PublicRecipeSummary, Recipe, RecipeKind } from '@/lib/types';

type Tab = 'collection' | 'explore';

export default function RecipesScreen() {
  // Atalhos de outras telas podem abrir uma aba específica (ex.: ?tab=explore).
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const requestedTab = tabParam === 'collection' || tabParam === 'explore' ? tabParam : null;
  const [tab, setTab] = useState<Tab>(requestedTab ?? 'collection');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [seenParam, setSeenParam] = useState(tabParam);
  if (tabParam !== seenParam) {
    setSeenParam(tabParam);
    if (requestedTab) setTab(requestedTab);
  }
  // Limpa o parâmetro para que o mesmo atalho funcione de novo depois.
  useEffect(() => {
    if (tabParam) router.setParams({ tab: undefined });
  }, [tabParam]);

  return (
    <View style={styles.screen}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'collection', label: 'Meu caderno', icon: 'book-outline' },
            { value: 'explore', label: 'Explorar', icon: 'compass-outline' },
          ]}
        />
        {/* Abaixo do toggle: cada aba busca coisas diferentes. Pessoas têm busca própria (Buscar amigos). */}
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'explore' ? 'Buscar receitas e preparos...' : 'Buscar no seu caderno...'}
        />
      </View>

      {tab === 'explore' ? <ExploreList query={query} /> : <CollectionList query={query} />}

      {tab === 'collection' && (
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
          router.push({ pathname: '/recipe/form', params: { kind } });
        }}
      />
    </View>
  );
}

type KindFilter = 'ALL' | RecipeKind;

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RECIPE', label: KIND.RECIPE.plural },
  { value: 'PREP', label: KIND.PREP.plural },
];

/** Meu caderno: receitas criadas por você + salvas de outras pessoas (estas somente leitura). */
function CollectionList({ query }: { query: string }) {
  const { recipes, ingredientName, getRecipe, needsContext } = useData();
  const [filter, setFilter] = useState<KindFilter>('ALL');

  const list = useMemo(() => {
    const q = normalizeSearch(query);
    return recipes.filter(
      (r) =>
        (filter === 'ALL' || r.kind === filter) &&
        (!q ||
          normalizeSearch(r.name).includes(q) ||
          r.items.some((i) => {
            const name = i.ingredientId ? ingredientName(i.ingredientId) : i.subRecipeId ? getRecipe(i.subRecipeId)?.name ?? '' : '';
            return normalizeSearch(name).includes(q);
          })),
    );
  }, [recipes, query, filter, ingredientName, getRecipe]);

  const empty = (() => {
    if (query) return <EmptyState icon="search" title="Nada encontrado" subtitle={`Nada com "${query}" no nome ou nos ingredientes.`} />;
    if (filter === 'RECIPE') return <EmptyState icon={KIND.RECIPE.icon} title="Nenhuma receita ainda" subtitle={`Toque em + e escolha Receita. Ex.: ${KIND.RECIPE.examples}`} />;
    if (filter === 'PREP') return <EmptyState icon={KIND.PREP.icon} title="Nenhum preparo ainda" subtitle={`Toque em + e escolha Preparo. Ex.: ${KIND.PREP.examples}`} />;
    return (
      <EmptyState
        icon="book-outline"
        title="Seu caderno de receitas está vazio"
        subtitle="Toque em + para cadastrar uma receita ou um preparo, ou salve receitas de outras pessoas em Explorar."
      />
    );
  })();

  return (
    <View style={{ flex: 1 }}>
      {recipes.length > 0 && (
        <View style={[styles.row, { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]} accessibilityRole="tablist">
          {FILTERS.map((f) => (
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

/** Biblioteca pública: uma categoria por vez (Receitas ou Preparos). Pessoas ficam na busca de amigos. */
function ExploreList({ query }: { query: string }) {
  const { userId } = useAuth();
  const { findCopyOf } = useData();
  const [kind, setKind] = useState<RecipeKind>('RECIPE');
  const [results, setResults] = useState<PublicRecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  // Digitação espera 300 ms; "tentar de novo" e puxar para atualizar buscam na hora.
  const immediate = useRef(false);
  const retry = () => {
    immediate.current = true;
    setRefreshing(true);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const delay = immediate.current ? 0 : 300;
    immediate.current = false;
    const t = setTimeout(async () => {
      try {
        const data = await searchPublicRecipes(query, userId);
        if (!cancelled) {
          setResults(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, userId, tick]);

  if (!isSupabaseConfigured) {
    return <EmptyState icon="cloud-offline-outline" title="Receitas publicadas indisponíveis" subtitle="O app não está conectado ao servidor." />;
  }

  // Categorias à esquerda; atalho discreto para buscar amigos à direita.
  const header = (
    <View style={[styles.row, { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>
      <View style={[styles.row, { gap: spacing.xs, flex: 1 }]} accessibilityRole="tablist">
        {(['RECIPE', 'PREP'] as const).map((k) => (
          <Chip key={k} label={KIND[k].plural} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      <Pressable
        onPress={() => router.push('/people')}
        accessibilityRole="link"
        accessibilityLabel="Buscar amigos"
        hitSlop={8}
        style={({ pressed }) => [styles.row, { gap: 4 }, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="people-outline" size={18} color={colors.muted} />
        <Text style={styles.muted}>Buscar amigos</Text>
      </Pressable>
    </View>
  );

  if (loading)
    return (
      <View style={{ flex: 1 }}>
        {header}
        <Loading />
      </View>
    );

  // Sem nada para mostrar: erro ocupa a área. Com resultados antigos: aviso no topo, lista continua.
  if (error && results.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <ErrorView error={error} context={{ title: 'Não foi possível carregar as receitas publicadas' }} onRetry={retry} retrying={refreshing} />
      </View>
    );
  }

  // As que já estão no caderno não aparecem aqui.
  const ofKind = results.filter((r) => r.kind === kind);
  const visible = ofKind.filter((r) => !findCopyOf(r.id));
  const allSaved = ofKind.length > 0 && visible.length === 0;
  const isPrep = kind === 'PREP';

  return (
    <View style={{ flex: 1 }}>
      {header}
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[colors.primary]} tintColor={colors.primary} />}
        ListHeaderComponent={
          error ? (
            <ErrorBanner
              error={error}
              message="Não foi possível atualizar. Mostrando os últimos resultados carregados."
              onRetry={retry}
              retrying={refreshing}
              onDismiss={() => setError(null)}
              style={{ marginBottom: spacing.xs }}
            />
          ) : undefined
        }
        renderItem={({ item }) => (
          <RecipeListItem id={item.id} kind={item.kind} name={item.name} itemCount={item.itemCount} author={item.authorName ?? 'usuário'} />
        )}
        ListEmptyComponent={
          error ? undefined : allSaved ? (
            <EmptyState
              icon="bookmark-outline"
              title={isPrep ? 'Você já salvou todos' : 'Você já salvou todas'}
              subtitle={`${isPrep ? 'Os preparos' : 'As receitas'} que você salvou estão no seu caderno.`}
            />
          ) : (
            <EmptyState
              icon={KIND[kind].icon}
              title={
                query
                  ? isPrep
                    ? 'Nenhum preparo encontrado'
                    : 'Nenhuma receita encontrada'
                  : isPrep
                    ? 'Nenhum preparo publicado ainda'
                    : 'Nenhuma receita publicada ainda'
              }
              subtitle={query ? undefined : 'Em breve, novidades por aqui.'}
            />
          )
        }
      />
    </View>
  );
}
