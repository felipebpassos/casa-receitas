import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/components/theme';
import { Badge, EmptyState, ErrorBanner, Loading, SearchBar, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { searchPublicRecipes } from '@/lib/publicLibrary';
import { computeNeeds, normalizeName } from '@/lib/shopping';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PublicRecipeSummary, Recipe } from '@/lib/types';

type Tab = 'mine' | 'saved' | 'explore';

export default function RecipesScreen() {
  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');

  return (
    <View style={styles.screen}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nome ou ingrediente..." />
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: 'Minhas' },
            { value: 'saved', label: 'Salvas' },
            { value: 'explore', label: 'Explorar' },
          ]}
        />
      </View>

      {tab === 'explore' ? <ExploreList query={query} /> : <CollectionList query={query} saved={tab === 'saved'} />}

      {tab !== 'explore' && (
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
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

/** Minhas (criadas por você) ou Salvas (cópias de receitas de outras pessoas). */
function CollectionList({ query, saved }: { query: string; saved: boolean }) {
  const { recipes, ingredientName, getRecipe, needsContext } = useData();

  const list = useMemo(() => {
    const q = normalizeName(query);
    return recipes
      .filter((r) => (saved ? r.originRecipeId : !r.originRecipeId))
      .filter(
        (r) =>
          !q ||
          normalizeName(r.name).includes(q) ||
          r.items.some((i) => {
            const name = i.ingredientId ? ingredientName(i.ingredientId) : i.subRecipeId ? getRecipe(i.subRecipeId)?.name ?? '' : '';
            return normalizeName(name).includes(q);
          }),
      );
  }, [recipes, query, saved, ingredientName, getRecipe]);

  return (
    <FlatList
      data={list}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 96, gap: spacing.sm }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <RecipeCard recipe={item} missing={computeNeeds([item.id], needsContext).length} />}
      ListEmptyComponent={
        query ? (
          <EmptyState icon="search" title="Nenhuma receita encontrada" subtitle={`Nada com "${query}" no nome ou nos ingredientes.`} />
        ) : saved ? (
          <EmptyState icon="bookmark-outline" title="Nenhuma receita salva" subtitle="Em Explorar, abra uma receita de outra pessoa e toque em Salvar na coleção." />
        ) : (
          <EmptyState icon="book-outline" title="Nenhuma receita ainda" subtitle="Toque em + para cadastrar a primeira." />
        )
      }
    />
  );
}

function RecipeCard({ recipe, missing }: { recipe: Recipe; missing: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      style={({ pressed }) => [styles.card, { gap: 4 }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <View style={styles.row}>
        <Text style={[styles.subtitle, { flex: 1 }]} numberOfLines={1}>
          {recipe.name}
        </Text>
        {recipe.isPublic && <Badge label="pública" tone="success" />}
      </View>
      {recipe.description ? (
        <Text style={styles.muted} numberOfLines={2}>
          {recipe.description}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Ionicons name={missing === 0 ? 'checkmark-circle' : 'cart-outline'} size={14} color={missing === 0 ? colors.primary : colors.accent} />
        <Text style={[styles.muted, { flex: 1 }]}>
          {missing === 0 ? 'Tem tudo em casa' : `Falta${missing > 1 ? 'm' : ''} ${missing} ite${missing > 1 ? 'ns' : 'm'}`}
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
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = await searchPublicRecipes(query, userId);
        if (!cancelled) {
          setResults(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, userId, tick]);

  if (!isSupabaseConfigured) {
    return <EmptyState icon="cloud-offline-outline" title="Biblioteca indisponível" subtitle="O app não está conectado ao servidor." />;
  }
  if (loading) return <Loading />;

  return (
    <FlatList
      data={results}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => setTick((t) => t + 1)} />}
      ListHeaderComponent={error ? <ErrorBanner message="Sem conexão com a biblioteca pública." onRetry={() => setTick((t) => t + 1)} /> : undefined}
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
            title={query ? 'Nenhuma receita encontrada' : 'Nenhuma receita pública ainda'}
            subtitle={query ? undefined : 'Publique as suas para começar a biblioteca!'}
          />
        )
      }
    />
  );
}
