import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorBanner, ErrorView } from '@/components/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing } from '@/components/theme';
import { Badge, EmptyState, Loading, SearchBar, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { searchPublicRecipes } from '@/lib/publicLibrary';
import { computeGroups, countItems, normalizeName } from '@/lib/shopping';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PublicRecipeSummary, Recipe } from '@/lib/types';

type Tab = 'collection' | 'explore';

export default function RecipesScreen() {
  // Atalhos de outras telas podem abrir uma aba específica (ex.: ?tab=explore).
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const requestedTab = tabParam === 'collection' || tabParam === 'explore' ? tabParam : null;
  const [tab, setTab] = useState<Tab>(requestedTab ?? 'collection');
  const [query, setQuery] = useState('');
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
        {/* Abaixo do toggle: cada aba busca coisas diferentes (no futuro, Explorar também busca perfis). */}
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'explore' ? 'Buscar receitas ou pessoas...' : 'Buscar no seu caderno...'}
        />
      </View>

      {tab === 'explore' ? <ExploreList query={query} /> : <CollectionList query={query} />}

      {tab === 'collection' && (
        <Pressable
          onPress={() => router.push('/recipe/form')}
          accessibilityLabel="Nova receita"
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
    </View>
  );
}

/** Meu caderno: receitas criadas por você + salvas de outras pessoas (estas somente leitura). */
function CollectionList({ query }: { query: string }) {
  const { recipes, ingredientName, getRecipe, needsContext } = useData();

  const list = useMemo(() => {
    const q = normalizeName(query);
    return recipes.filter(
        (r) =>
          !q ||
          normalizeName(r.name).includes(q) ||
          r.items.some((i) => {
            const name = i.ingredientId ? ingredientName(i.ingredientId) : i.subRecipeId ? getRecipe(i.subRecipeId)?.name ?? '' : '';
            return normalizeName(name).includes(q);
          }),
      );
  }, [recipes, query, ingredientName, getRecipe]);

  return (
    <FlatList
      data={list}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <RecipeCard recipe={item} itemCount={countItems(computeGroups([item.id], needsContext))} />}
      ListEmptyComponent={
        query ? (
          <EmptyState icon="search" title="Nenhuma receita encontrada" subtitle={`Nada com "${query}" no nome ou nos ingredientes.`} />
        ) : (
          <EmptyState
            icon="book-outline"
            title="Seu caderno de receitas está vazio"
            subtitle="Toque em + para cadastrar uma receita, ou salve receitas de outras pessoas em Explorar."
          />
        )
      }
    />
  );
}

function RecipeCard({ recipe, itemCount }: { recipe: Recipe; itemCount: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      style={({ pressed }) => [styles.card, { gap: 4 }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <View style={styles.row}>
        <Text style={[styles.subtitle, { flex: 1 }]} numberOfLines={1}>
          {recipe.name}
        </Text>
        {recipe.originRecipeId ? <Badge label="salva" /> : <StatusBadge status={recipe.status} />}
      </View>
      {recipe.description ? (
        <Text style={styles.muted} numberOfLines={2}>
          {recipe.description}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Ionicons name="cart-outline" size={14} color={colors.accent} />
        <Text style={[styles.muted, { flex: 1 }]}>
          {`${itemCount} ingrediente${itemCount === 1 ? '' : 's'}`}
          {recipe.originAuthorName ? ` · de ${recipe.originAuthorName}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** Biblioteca pública (receitas de outras pessoas). */
function ExploreList({ query }: { query: string }) {
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
  if (loading) return <Loading />;

  // Sem nada para mostrar: erro ocupa a área. Com resultados antigos: aviso no topo, lista continua.
  if (error && results.length === 0) {
    return <ErrorView error={error} context={{ title: 'Não foi possível carregar as receitas publicadas' }} onRetry={retry} retrying={refreshing} />;
  }

  return (
    <FlatList
      data={results}
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
        <Pressable
          onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.id } })}
          style={({ pressed }) => [styles.card, { gap: 4 }, pressed && { backgroundColor: colors.primaryLight }]}
        >
          <View style={styles.row}>
            <Text style={[styles.subtitle, { flex: 1 }]} numberOfLines={1}>
              {item.name}
            </Text>
            {findCopyOf(item.id) && <Badge label="salva" tone="success" />}
          </View>
          {item.description ? (
            <Text style={styles.muted} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <Text style={styles.muted}>
            {item.itemCount} ingrediente(s){item.authorName ? ` · por ${item.authorName}` : ''}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        error ? undefined : (
          <EmptyState
            icon="globe-outline"
            title={query ? 'Nenhuma receita encontrada' : 'Nenhuma receita publicada ainda'}
            subtitle={query ? undefined : 'Publique as suas e seja a primeira pessoa a compartilhar!'}
          />
        )
      }
    />
  );
}
