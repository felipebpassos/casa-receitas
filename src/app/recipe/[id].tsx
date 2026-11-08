import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { DayPicker } from '@/components/DayPicker';
import { NeedsList } from '@/components/NeedsList';
import { colors, spacing } from '@/components/theme';
import { Badge, Button, EmptyState, ErrorBanner, Loading, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { formatShort, weekdayName } from '@/lib/dates';
import { getPublicRecipeTree } from '@/lib/publicLibrary';
import { computeNeeds, formatQuantity, type NeedsContext } from '@/lib/shopping';
import { PLATFORM_ICON, PLATFORM_LABEL, platformOf } from '@/lib/source';
import type { PublicRecipeTree, Recipe } from '@/lib/types';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipe } = useData();
  const own = getRecipe(id);
  return own ? <RecipeView recipe={own} /> : <PublicRecipeLoader id={id} />;
}

/** Receita que não está na coleção: busca na biblioteca pública. */
function PublicRecipeLoader({ id }: { id: string }) {
  const [tree, setTree] = useState<PublicRecipeTree | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicRecipeTree(id)
      .then((t) => !cancelled && setTree(t))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  if (error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorBanner message={error} onRetry={() => { setError(null); setTick((t) => t + 1); }} />
      </View>
    );
  }
  if (tree === undefined) return <Loading />;
  if (tree === null) return <EmptyState icon="lock-closed-outline" title="Receita não encontrada" subtitle="Ela pode ter sido excluída ou deixado de ser pública." />;
  return <RecipeView recipe={tree.root} tree={tree} />;
}

function RecipeView({ recipe, tree }: { recipe: Recipe; tree?: PublicRecipeTree }) {
  const data = useData();
  const [pickingDay, setPickingDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const isPublicView = !!tree;
  // Receita salva de outra pessoa: fica na coleção, mas somente leitura.
  const isSavedCopy = !isPublicView && !!recipe.originRecipeId;
  const savedCopy = tree ? data.findCopyOf(tree.root.id) : undefined;

  // Contexto do cálculo: a coleção, ou a árvore da receita pública + sua despensa.
  const ctx: NeedsContext = useMemo(() => {
    if (!tree) return data.needsContext;
    return {
      getRecipe: (rid) => (rid === tree.root.id ? tree.root : tree.subs[rid]),
      ingredientName: (iid) => tree.ingredientNames[iid] ?? data.ingredientName(iid),
      hasIngredient: (iid) => data.pantryIngredients.has(iid),
      hasRecipe: (rid) => {
        const copy = data.findCopyOf(rid);
        return !!copy && data.pantryRecipes.has(copy.id);
      },
    };
  }, [tree, data]);

  const needs = useMemo(() => computeNeeds([recipe.id], ctx), [recipe.id, ctx]);
  const platform = platformOf(recipe.sourcePlatform);

  const saveToCollection = async () => {
    if (!tree) return null;
    setBusy(true);
    const copyId = await data.saveCopy(tree);
    setBusy(false);
    return copyId;
  };

  const addToWeek = async (date: string) => {
    setPickingDay(false);
    let recipeId: string | null = recipe.id;
    if (isPublicView) {
      recipeId = await saveToCollection();
      if (!recipeId) return;
    }
    if (await data.addMealPlan(date, recipeId)) {
      Alert.alert(
        'Adicionada à semana',
        `${recipe.name} foi planejada para ${weekdayName(date).toLowerCase()}, ${formatShort(date)}.${isPublicView && !savedCopy ? '\n\nEla também foi salva no seu caderno de receitas.' : ''}`,
      );
    }
  };

  const confirmDelete = () =>
    Alert.alert('Excluir receita', `Excluir "${recipe.name}"? Ela também sai da sua semana.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (await data.deleteRecipe(recipe.id)) router.back();
        },
      },
    ]);

  const confirmRemove = () =>
    Alert.alert('Remover do caderno', `Remover "${recipe.name}" do seu caderno de receitas? Ela também sai da sua semana. Você pode salvá-la de novo em Explorar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          if (await data.deleteRecipe(recipe.id)) router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: recipe.name }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 }}>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.title}>{recipe.name}</Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {!isPublicView && recipe.isPublic && <Badge label="pública" tone="success" />}
            {isPublicView && <Text style={styles.muted}>por {tree.authorName ?? 'usuário'}</Text>}
            {!isPublicView && recipe.originAuthorName && <Text style={styles.muted}>receita de {recipe.originAuthorName}</Text>}
          </View>
          {recipe.description ? <Text style={[styles.body, { marginTop: spacing.sm }]}>{recipe.description}</Text> : null}
        </View>

        {/* Ações principais */}
        {isPublicView ? (
          savedCopy ? (
            <Button title="No seu caderno de receitas · abrir" icon="bookmark" variant="secondary" onPress={() => router.replace({ pathname: '/recipe/[id]', params: { id: savedCopy.id } })} />
          ) : (
            <Button
              title="Salvar no caderno"
              icon="bookmark-outline"
              loading={busy}
              onPress={async () => {
                const copyId = await saveToCollection();
                if (copyId) router.replace({ pathname: '/recipe/[id]', params: { id: copyId } });
              }}
            />
          )
        ) : null}
        <Button title="Adicionar à semana" icon="calendar-outline" variant={isPublicView ? 'secondary' : 'primary'} onPress={() => setPickingDay(true)} />

        {recipe.sourceUrl ? (
          <Button
            title={platform === 'site' ? 'Ver receita original' : `Ver no ${PLATFORM_LABEL[platform]}`}
            icon={PLATFORM_ICON[platform]}
            variant="ghost"
            onPress={() => Linking.openURL(recipe.sourceUrl!).catch(() => Alert.alert('Link inválido', recipe.sourceUrl!))}
          />
        ) : null}

        {/* O que comprar */}
        <View style={[styles.card, { gap: spacing.sm, borderColor: needs.length ? colors.accent : colors.primary }]}>
          {needs.length === 0 ? (
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              <Text style={styles.subtitle}>Você tem tudo em casa!</Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Ionicons name="cart-outline" size={20} color={colors.accent} />
                <Text style={styles.subtitle}>Para fazer essa receita, compre:</Text>
              </View>
              <NeedsList items={needs} showUsedIn={recipe.items.some((i) => i.subRecipeId)} />
            </>
          )}
        </View>

        {/* Ingredientes */}
        <View style={[styles.card, { gap: spacing.sm }]}>
          <Text style={styles.subtitle}>Ingredientes</Text>
          {recipe.items.map((item) => {
            if (item.subRecipeId) {
              const sub = ctx.getRecipe(item.subRecipeId);
              const has = ctx.hasRecipe(item.subRecipeId);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => sub && router.push({ pathname: '/recipe/[id]', params: { id: item.subRecipeId! } })}
                  style={styles.row}
                >
                  <Ionicons name={has ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={has ? colors.primary : colors.border} />
                  <Text style={[styles.body, { flex: 1, color: colors.primary, fontWeight: '600' }]}>{sub?.name ?? 'Receita indisponível'}</Text>
                  <Text style={styles.muted}>{formatQuantity(item.quantity, item.unit) || 'receita'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            }
            const has = ctx.hasIngredient(item.ingredientId!);
            return (
              <View key={item.id} style={styles.row}>
                <Ionicons name={has ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={has ? colors.primary : colors.border} />
                <Text style={[styles.body, { flex: 1 }]}>{ctx.ingredientName(item.ingredientId!)}</Text>
                <Text style={styles.muted}>{formatQuantity(item.quantity, item.unit)}</Text>
              </View>
            );
          })}
          <Text style={styles.muted}>✓ = você tem em casa (aba Despensa)</Text>
        </View>

        {recipe.preparation ? (
          <View style={[styles.card, { gap: spacing.sm }]}>
            <Text style={styles.subtitle}>Modo de preparo</Text>
            <Text style={styles.body}>{recipe.preparation}</Text>
          </View>
        ) : null}

        {isSavedCopy && <Button title="Remover do caderno" icon="bookmark" variant="ghost" onPress={confirmRemove} />}
        {!isPublicView && !isSavedCopy && (
          <View style={{ gap: spacing.md }}>
            <Button title="Editar receita" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/recipe/form', params: { id: recipe.id } })} />
            <Button title="Excluir receita" icon="trash-outline" variant="danger" onPress={confirmDelete} />
          </View>
        )}
      </ScrollView>

      <DayPicker visible={pickingDay} title={`Planejar "${recipe.name}"`} onClose={() => setPickingDay(false)} onSelect={addToWeek} />
    </>
  );
}
