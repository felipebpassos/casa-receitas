import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { DayPicker } from '@/components/DayPicker';
import { RichText } from '@/components/RichText';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { ErrorView } from '@/components/ErrorState';
import { toast } from '@/components/Toast';
import { BottomBar, Button, EmptyState, Loading, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { formatShort, weekdayName } from '@/lib/dates';
import { UserFacingError } from '@/lib/errors';
import { getPublicRecipeTree } from '@/lib/publicLibrary';
import { parseRichText } from '@/lib/richText';
import { formatQuantity, type NeedsContext } from '@/lib/shopping';
import { PLATFORM_ICON, PLATFORM_LABEL, platformOf } from '@/lib/source';
import type { PublicRecipeTree, Recipe, RecipeStatus } from '@/lib/types';

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

  /** Cópia salva desta receita no caderno (a própria, ou a da receita pública aberta). */
  const copyId = isSavedCopy ? recipe.id : savedCopy?.id;
  const isSaved = !!copyId;

  const save = async () => {
    const newId = await saveToCollection();
    if (!newId) return;
    toast.success('Salva no seu caderno', recipe.name);
    router.replace({ pathname: '/recipe/[id]', params: { id: newId } });
  };

  const confirmRemove = () =>
    confirm({
      title: 'Remover do caderno',
      message: `Remover "${recipe.name}" do seu caderno de receitas? Ela também sai da sua semana.`,
      confirmText: 'Remover',
      destructive: true,
      onConfirm: async () => {
        if (!copyId || !(await data.deleteRecipe(copyId))) return;
        toast.success('Removida do caderno', recipe.name);
        // Continua na receita, agora como não salva (versão pública).
        if (isSavedCopy && recipe.originRecipeId) router.replace({ pathname: '/recipe/[id]', params: { id: recipe.originRecipeId } });
      },
    });

  const author = isPublicView ? (tree.authorName ?? 'usuário') : recipe.originAuthorName;
  const isOwn = !isPublicView && !isSavedCopy;
  const ingredients = recipe.items.filter((i) => !i.subRecipeId);
  const subItems = recipe.items.filter((i) => i.subRecipeId);
  const hasPreparation = parseRichText(recipe.preparation).length > 0;
  const openSource = () =>
    Linking.openURL(recipe.sourceUrl!).catch(() => toast.error(new UserFacingError('Não foi possível abrir este link.', 'Link inválido')));

  return (
    <>
      <Stack.Screen
        options={{
          title: recipe.name,
          headerTitleAlign: 'left',
          headerTitle: () => <HeaderTitle name={recipe.name} author={author} status={isOwn ? recipe.status : null} />,
          headerRight: () =>
            isOwn ? (
              <HeaderAction
                icon="create-outline"
                label="Editar receita"
                onPress={() => router.push({ pathname: '/recipe/form', params: { id: recipe.id } })}
              />
            ) : (
              <HeaderAction
                icon={isSaved ? 'bookmark' : 'bookmark-outline'}
                label={isSaved ? 'Remover do caderno' : 'Salvar no caderno'}
                active={isSaved}
                loading={busy}
                onPress={isSaved ? confirmRemove : save}
              />
            ),
        }}
      />
      {/* Divisória entre o header e o conteúdo */}
      <View style={styles.separator} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl }}>
        {recipe.description ? <Text style={styles.body}>{recipe.description}</Text> : null}

        {!isPublicView && recipe.status === 'PENDING' && (
          <View style={[styles.card, styles.row, { backgroundColor: colors.warningLight, borderColor: colors.warningLight }]}>
            <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
            <Text style={[styles.body, { flex: 1 }]}>Em análise pela moderação. Enquanto isso, você já pode usá-la na sua semana.</Text>
          </View>
        )}
        {!isPublicView && recipe.status === 'REJECTED' && (
          <View style={[styles.card, { backgroundColor: colors.dangerLight, borderColor: colors.danger, gap: spacing.xs }]}>
            <Text style={[styles.subtitle, { color: colors.danger }]}>Não aprovada para publicação</Text>
            <Text style={styles.body}>{recipe.rejectionReason || 'Sem motivo informado.'}</Text>
            <Text style={styles.muted}>Ela continua no seu caderno. Edite e envie de novo, se quiser.</Text>
          </View>
        )}

        {/* Ingredientes: os da receita e, em seguida, as subreceitas (clicáveis) */}
        {recipe.items.length > 0 && (
          <Section title="Ingredientes">
            <View style={[styles.card, { padding: 0 }]}>
              {ingredients.map((item, idx) => (
                <View key={item.id}>
                  {idx > 0 && <View style={[styles.separator, { marginLeft: spacing.md }]} />}
                  <View style={[styles.row, { paddingHorizontal: spacing.md, paddingVertical: spacing.md }]}>
                    <View style={local.dot} />
                    <Text style={[styles.body, { flex: 1 }]}>{ctx.ingredientName(item.ingredientId!)}</Text>
                    <Text style={local.qty}>{formatQuantity(item.quantity, item.unit)}</Text>
                  </View>
                </View>
              ))}
              {subItems.map((item, idx) => {
                const sub = ctx.getRecipe(item.subRecipeId!);
                const qty = formatQuantity(item.quantity, item.unit);
                const count = sub?.items.length ?? 0;
                const caption = sub ? ['Subreceita', qty, `${count} ${count === 1 ? 'item' : 'itens'}`].filter(Boolean).join(' · ') : 'Receita indisponível';
                return (
                  <View key={item.id}>
                    {(ingredients.length > 0 || idx > 0) && <View style={styles.separator} />}
                    <Pressable
                      disabled={!sub}
                      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.subRecipeId! } })}
                      accessibilityRole="link"
                      accessibilityLabel={sub ? `Subreceita ${sub.name}. Abrir receita` : 'Subreceita indisponível'}
                      style={({ pressed }) => [
                        styles.row,
                        { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md },
                        pressed && { backgroundColor: colors.primaryLight },
                      ]}
                    >
                      <View style={local.subIcon}>
                        <Ionicons name="book-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.body, { fontWeight: '600', color: sub ? colors.text : colors.muted }]} numberOfLines={1}>
                          {sub?.name ?? 'Subreceita'}
                        </Text>
                        <Text style={styles.muted}>{caption}</Text>
                      </View>
                      {sub && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {hasPreparation && (
          <Section title="Modo de preparo">
            <View style={styles.card}>
              <RichText value={recipe.preparation} />
            </View>
          </Section>
        )}

        {isOwn && <Button title="Excluir receita" icon="trash-outline" variant="dangerGhost" onPress={confirmDelete} />}
      </ScrollView>

      {/* Ações principais, sempre à mão */}
      <BottomBar>
        <Button title="Adicionar à semana" icon="calendar-outline" loading={busy} onPress={() => setPickingDay(true)} />
        {recipe.sourceUrl ? (
          <Button
            title={platform === 'site' ? 'Ver receita original' : `Ver no ${PLATFORM_LABEL[platform]}`}
            icon={PLATFORM_ICON[platform]}
            variant="ghost"
            onPress={openSource}
          />
        ) : null}
      </BottomBar>

      <DayPicker visible={pickingDay} title={`Planejar "${recipe.name}"`} onClose={() => setPickingDay(false)} onSelect={addToWeek} />
    </>
  );
}

/** Título do header: nome da receita e, embaixo, autor e/ou situação. */
function HeaderTitle({ name, author, status }: { name: string; author?: string | null; status: RecipeStatus | null }) {
  const showStatus = !!status && status !== 'PRIVATE';
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={local.headerName} numberOfLines={1}>
        {name}
      </Text>
      {(author || showStatus) && (
        <View style={[styles.row, { gap: spacing.xs }]}>
          {author ? (
            <Text style={styles.muted} numberOfLines={1}>
              por {author}
            </Text>
          ) : null}
          {showStatus && <StatusBadge status={status} />}
        </View>
      )}
    </View>
  );
}

/** Botão redondo do header, com área de toque confortável e afastado da borda. */
function HeaderAction({
  icon,
  label,
  onPress,
  active,
  loading,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, busy: !!loading }}
      style={({ pressed }) => [
        local.headerAction,
        active && { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
        pressed && { opacity: 0.6 },
      ]}
    >
      {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name={icon} size={22} color={active ? colors.primary : colors.text} />}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.subtitle}>{title}</Text>
      {children}
    </View>
  );
}

const local = StyleSheet.create({
  headerName: { fontSize: 21, fontFamily: fonts.serifSemiBold, color: colors.text },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  qty: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  subIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
});
