import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { ErrorBanner, ErrorView } from '@/components/ErrorState';
import { PersonListItem } from '@/components/PersonListItem';
import { RecipeListItem } from '@/components/RecipeListItem';
import { KIND, KIND_FILTERS, type KindFilter } from '@/components/RecipeKind';
import { colors, spacing } from '@/components/theme';
import { Chip, EmptyState, Loading, SearchBar, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { searchPublicProfiles, searchPublicRecipes, type PublicPersonSummary } from '@/lib/publicLibrary';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PublicRecipeSummary } from '@/lib/types';

/** Explorar também busca pessoas. */
type ExploreFilter = KindFilter | 'USER';

const EXPLORE_FILTERS: { value: ExploreFilter; label: string }[] = [...KIND_FILTERS, { value: 'USER', label: 'Usuários' }];

/** Busca do Explorar acompanha a categoria escolhida. */
const EXPLORE_PLACEHOLDER: Record<ExploreFilter, string> = {
  ALL: 'Buscar receitas e preparos...',
  RECIPE: 'Buscar receitas...',
  PREP: 'Buscar preparos...',
  USER: 'Buscar pelo nome de usuário...',
};

/** Textos da lista vazia do Explorar, por categoria. */
const EMPTY_TEXT: Record<KindFilter, { allSaved: string; allSavedHint: string; notFound: string; nonePublished: string }> = {
  ALL: {
    allSaved: 'Você já salvou tudo',
    allSavedHint: 'O que você salvou está em Receitas › Salvas.',
    notFound: 'Nada encontrado',
    nonePublished: 'Nada publicado ainda',
  },
  RECIPE: {
    allSaved: 'Você já salvou todas',
    allSavedHint: 'As receitas que você salvou estão em Receitas › Salvas.',
    notFound: 'Nenhuma receita encontrada',
    nonePublished: 'Nenhuma receita publicada ainda',
  },
  PREP: {
    allSaved: 'Você já salvou todos',
    allSavedHint: 'Os preparos que você salvou estão em Receitas › Salvas.',
    notFound: 'Nenhum preparo encontrado',
    nonePublished: 'Nenhum preparo publicado ainda',
  },
};

/** Explorar: biblioteca pública (todas, Receitas ou Preparos) ou busca de pessoas (Usuários). */
export default function ExploreScreen() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ExploreFilter>('ALL');

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="cloud-offline-outline" title="Explorar indisponível" subtitle="O app não está conectado ao servidor." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={EXPLORE_PLACEHOLDER[kind]}
          autoCapitalize={kind === 'USER' ? 'none' : undefined}
        />
      </View>
      <View style={[styles.row, { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexWrap: 'wrap' }]} accessibilityRole="tablist">
        {EXPLORE_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={kind === f.value} onPress={() => setKind(f.value)} />
        ))}
      </View>
      {kind === 'USER' ? <PeopleResults query={query} /> : <RecipeResults key={kind} query={query} kind={kind} />}
    </View>
  );
}

/** Busca de pessoas: só pelo nome de usuário exato. Nada aparece antes de digitar (não é uma lista de todo mundo). */
function PeopleResults({ query }: { query: string }) {
  const { userId } = useAuth();
  const term = query.trim();
  // Resultado da última busca concluída; se for de outro termo, ainda está buscando.
  const [result, setResult] = useState<{ term: string; data: PublicPersonSummary[]; error?: undefined } | { term: string; data?: undefined; error: unknown } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = await searchPublicProfiles(term, userId);
        if (!cancelled) setResult({ term, data });
      } catch (e) {
        if (!cancelled) setResult({ term, error: e });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, userId, tick]);

  const retry = () => {
    setResult(null);
    setTick((n) => n + 1);
  };

  if (!term)
    return <EmptyState icon="people-outline" title="Encontre seus amigos" subtitle="Digite o nome de usuário exato de quem você procura (ex.: maria.silva)." />;
  if (!result || result.term !== term) return <Loading />;
  if (!result.data) return <ErrorView error={result.error} context={{ title: 'Não foi possível buscar' }} onRetry={retry} />;

  return (
    <FlatList
      data={result.data}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <PersonListItem person={item} />}
      ListEmptyComponent={
        <EmptyState icon="search" title="Ninguém encontrado" subtitle={`Ninguém com o usuário "${term.replace(/^@+/, '')}". Confira se digitou o nome exato.`} />
      }
    />
  );
}

type RecipePageState = { items: PublicRecipeSummary[]; total: number; matched: number };

/** Receitas e preparos publicados, em páginas (carrega mais ao chegar no fim da lista). */
function RecipeResults({ query, kind }: { query: string; kind: KindFilter }) {
  const { userId } = useAuth();
  const { recipes, findCopyOf } = useData();
  const [page, setPage] = useState<RecipePageState>({ items: [], total: 0, matched: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  // As já salvas não aparecem nem contam. Lidas na hora da busca (salvar uma não recarrega a lista).
  const savedIds = useRef<string[]>([]);
  useEffect(() => {
    savedIds.current = recipes.map((r) => r.originRecipeId).filter((x): x is string => !!x);
  }, [recipes]);
  const kindParam = kind === 'ALL' ? null : kind;

  // Cada busca nova invalida as páginas que ainda estavam chegando da anterior.
  const generation = useRef(0);

  // Digitação espera 300 ms; trocar a categoria, "tentar de novo" e puxar para atualizar buscam na hora.
  const immediate = useRef(false);
  const lastQuery = useRef(query);
  const retry = () => {
    immediate.current = true;
    setRefreshing(true);
    setTick((t) => t + 1);
  };

  useEffect(() => {
    const gen = ++generation.current;
    const delay = immediate.current || lastQuery.current === query ? 0 : 300;
    immediate.current = false;
    lastQuery.current = query;
    const t = setTimeout(async () => {
      setLoadingMore(false);
      setMoreError(null);
      try {
        const data = await searchPublicRecipes(query, { kind: kindParam, excludeIds: savedIds.current });
        if (gen === generation.current) {
          setPage(data);
          setError(null);
        }
      } catch (e) {
        if (gen === generation.current) setError(e);
      } finally {
        if (gen === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, delay);
    return () => clearTimeout(t);
  }, [query, kindParam, userId, tick]);

  // Salvas depois de carregar a página somem da lista e do total.
  const visible = page.items.filter((r) => !findCopyOf(r.id));
  const total = Math.max(page.total - (page.items.length - visible.length), visible.length);
  const hasMore = visible.length < total;

  const loadMore = async (afterError = false) => {
    if (loading || loadingMore || refreshing || !hasMore || (moreError && !afterError)) return;
    const gen = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      // O servidor já tira as salvas, então a próxima página começa depois das que ainda aparecem.
      const data = await searchPublicRecipes(query, { kind: kindParam, excludeIds: savedIds.current, offset: visible.length });
      if (gen !== generation.current) return;
      setPage((prev) => {
        const kept = prev.items.filter((r) => !findCopyOf(r.id));
        const seen = new Set(kept.map((r) => r.id));
        const items = [...kept, ...data.items.filter((r) => !seen.has(r.id))];
        // Página vazia: a busca encolheu desde a primeira página; para de pedir mais.
        return { items, total: data.items.length ? Math.max(data.total, items.length) : items.length, matched: prev.matched };
      });
    } catch (e) {
      if (gen === generation.current) setMoreError(e);
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  };

  if (loading) return <Loading />;

  // Sem nada para mostrar: erro ocupa a área. Com resultados antigos: aviso no topo, lista continua.
  if (error && page.items.length === 0) {
    return <ErrorView error={error} context={{ title: 'Não foi possível carregar as receitas publicadas' }} onRetry={retry} retrying={refreshing} />;
  }

  const allSaved = visible.length === 0 && (page.matched > 0 || page.items.length > 0);
  const text = EMPTY_TEXT[kind];

  return (
    <FlatList
      data={visible}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[colors.primary]} tintColor={colors.primary} />}
      onEndReached={() => loadMore()}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <>
          {error ? (
            <ErrorBanner
              error={error}
              message="Não foi possível atualizar. Mostrando os últimos resultados carregados."
              onRetry={retry}
              retrying={refreshing}
              onDismiss={() => setError(null)}
              style={{ marginBottom: spacing.xs }}
            />
          ) : null}
          {total > 0 ? (
            <Text style={styles.muted} accessibilityLiveRegion="polite">
              {total === 1 ? '1 resultado' : `${total.toLocaleString('pt-BR')} resultados`}
            </Text>
          ) : null}
        </>
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
        ) : moreError ? (
          <ErrorBanner error={moreError} message="Não foi possível carregar mais resultados." onRetry={() => loadMore(true)} />
        ) : undefined
      }
      renderItem={({ item }) => (
        <RecipeListItem id={item.id} kind={item.kind} name={item.name} itemCount={item.itemCount} author={item.authorName ?? 'usuário'} />
      )}
      ListEmptyComponent={
        error ? undefined : allSaved ? (
          <EmptyState icon="bookmark-outline" title={text.allSaved} subtitle={text.allSavedHint} />
        ) : (
          <EmptyState
            icon={kind === 'ALL' ? 'compass-outline' : KIND[kind].icon}
            title={query ? text.notFound : text.nonePublished}
            subtitle={query ? undefined : 'Em breve, novidades por aqui.'}
          />
        )
      }
    />
  );
}
