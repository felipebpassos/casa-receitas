import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { DayPicker } from '@/components/DayPicker';
import { NeedsList } from '@/components/NeedsList';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, spacing } from '@/components/theme';
import { ErrorView } from '@/components/ErrorState';
import { toast } from '@/components/Toast';
import { Button, EmptyState, Loading, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { formatShort, weekdayName } from '@/lib/dates';
import { UserFacingError } from '@/lib/errors';
import { getPublicRecipeTree } from '@/lib/publicLibrary';
import { computeGroups, formatQuantity, type NeedsContext } from '@/lib/shopping';
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
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicRecipeTree(id)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e))
      .finally(() => !cancelled && setRetrying(false));
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  if (error) {
    return (
      <ErrorView
        error={error}
        context={{ title: 'Não foi possível abrir a receita' }}
        retrying={retrying}
        onRetry={() => {
          setRetrying(true);
          setTick((t) => t + 1);
        }}
        actions={router.canGoBack() ? <Button title="Voltar" variant="ghost" onPress={() => router.back()} /> : null}
      />
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

  // Contexto do cálculo: a coleção, ou a árvore da receita pública.
  const { needsContext, ingredientName } = data;
  const ctx: NeedsContext = useMemo(() => {
    if (!tree) return needsContext;
    return {
      getRecipe: (rid) => (rid === tree.root.id ? tree.root : tree.subs[rid]),
      ingredientName: (iid) => tree.ingredientNames[iid] ?? ingredientName(iid),
    };
  }, [tree, needsContext, ingredientName]);

  const hasSubs = recipe.items.some((i) => i.subRecipeId);
  const groups = useMemo(() => (hasSubs ? computeGroups([recipe.id], ctx) : []), [hasSubs, recipe.id, ctx]);
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
      toast.success(
        'Adicionada à semana',
        `${recipe.name} foi planejada para ${weekdayName(date).toLowerCase()}, ${formatShort(date)}.${isPublicView && !savedCopy ? ' Ela também foi salva no seu caderno.' : ''}`,
        { action: { label: 'Ver semana', onPress: () => router.navigate('/semana') } },
      );
    }
  };

  const confirmDelete = () =>
    confirm({
      title: 'Excluir receita',
      message: `Excluir "${recipe.name}"? Ela também sai da sua semana.`,
      confirmText: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        if (!(await data.deleteRecipe(recipe.id))) return;
        toast.success('Receita excluída', recipe.name);
        router.back();
      },
    });

  const confirmRemove = () =>
    confirm({
      title: 'Remover do caderno',
      message: `Remover "${recipe.name}" do seu caderno de receitas? Ela também sai da sua semana. Você pode salvá-la de novo em Explorar.`,
      confirmText: 'Remover',
      destructive: true,
      onConfirm: async () => {
        if (!(await data.deleteRecipe(recipe.id))) return;
        toast.success('Removida do caderno', recipe.name);
        router.back();
      },
    });

  return (
    <>
      <Stack.Screen options={{ title: recipe.name }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 }}>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.title}>{recipe.name}</Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {!isPublicView && !isSavedCopy && <StatusBadge status={recipe.status} />}
            {isPublicView && <Text style={styles.muted}>por {tree.authorName ?? 'usuário'}</Text>}
            {!isPublicView && recipe.originAuthorName && <Text style={styles.muted}>receita de {recipe.originAuthorName}</Text>}
          </View>
          {recipe.description ? <Text style={[styles.body, { marginTop: spacing.sm }]}>{recipe.description}</Text> : null}
        </View>

        {!isPublicView && recipe.status === 'PENDING' && (
          <View style={[styles.card, styles.row, { backgroundColor: colors.warningLight, borderColor: colors.warningLight }]}>
            <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
            <Text style={[styles.body, { flex: 1 }]}>Em análise pela moderação. Enquanto isso, você já pode usá-la na sua semana.</Text>
          </View>
        )}
        {!isPublicView && recipe.status === 'REJECTED' && (
          <View style={[styles.card, { backgroundColor: colors.dangerLight, borderColor: colors.danger, gap: spacing.xs }]}>
            <Text style={[styles.subtitle, { color: colors.danger }]}>Não aprovada para a biblioteca</Text>
            <Text style={styles.body}>{recipe.rejectionReason || 'Sem motivo informado.'}</Text>
            <Text style={styles.muted}>Ela continua no seu caderno. Edite e envie de novo, se quiser.</Text>
          </View>
        )}

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
                if (!copyId) return;
                toast.success('Salva no seu caderno', recipe.name);
                router.replace({ pathname: '/recipe/[id]', params: { id: copyId } });
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
            onPress={() => Linking.openURL(recipe.sourceUrl!).catch(() => toast.error(new UserFacingError('Não foi possível abrir este link.', 'Link inválido')))}
          />
        ) : null}

        {/* Ingredientes */}
        <View style={[styles.card, { gap: spacing.sm }]}>
          <Text style={styles.subtitle}>Ingredientes</Text>
          {recipe.items.map((item) => {
            if (item.subRecipeId) {
              const sub = ctx.getRecipe(item.subRecipeId);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => sub && router.push({ pathname: '/recipe/[id]', params: { id: item.subRecipeId! } })}
                  style={styles.row}
                >
                  <Ionicons name="book-outline" size={18} color={colors.success} />
                  <Text style={[styles.body, { flex: 1, color: colors.primary, fontWeight: '600' }]}>{sub?.name ?? 'Receita indisponível'}</Text>
                  <Text style={styles.muted}>{formatQuantity(item.quantity, item.unit) || 'receita'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            }
            return (
              <View key={item.id} style={styles.row}>
                <Text style={{ color: colors.accent, fontSize: 18, width: 18, textAlign: 'center' }}>•</Text>
                <Text style={[styles.body, { flex: 1 }]}>{ctx.ingredientName(item.ingredientId!)}</Text>
                <Text style={styles.muted}>{formatQuantity(item.quantity, item.unit)}</Text>
              </View>
            );
          })}
        </View>

        {/* Com subpreparos: tudo o que vai precisar, separado por preparo */}
        {groups.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.row}>
              <Ionicons name="cart-outline" size={20} color={colors.accent} />
              <Text style={styles.subtitle}>Tudo o que vai precisar</Text>
            </View>
            <NeedsList groups={groups} />
          </View>
        )}

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
