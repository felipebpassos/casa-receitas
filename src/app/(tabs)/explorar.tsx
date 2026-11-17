import { useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
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
      {kind === 'USER' ? <PeopleResults query={query} /> : <RecipeResults query={query} kind={kind} />}
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

/** Receitas e preparos publicados. */
function RecipeResults({ query, kind }: { query: string; kind: KindFilter }) {
  const { userId } = useAuth();
  const { findCopyOf } = useData();
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

  if (loading) return <Loading />;

  // Sem nada para mostrar: erro ocupa a área. Com resultados antigos: aviso no topo, lista continua.
  if (error && results.length === 0) {
    return <ErrorView error={error} context={{ title: 'Não foi possível carregar as receitas publicadas' }} onRetry={retry} retrying={refreshing} />;
  }

  // As que já estão salvas não aparecem aqui.
  const ofKind = kind === 'ALL' ? results : results.filter((r) => r.kind === kind);
  const visible = ofKind.filter((r) => !findCopyOf(r.id));
  const allSaved = ofKind.length > 0 && visible.length === 0;
  const text = EMPTY_TEXT[kind];

  return (
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
