import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { DayPicker } from '@/components/DayPicker';
import { DropdownMenu } from '@/components/DropdownMenu';
import { ModalScreen } from '@/components/ModalScreen';
import { KIND, KindIcon } from '@/components/RecipeKind';
import { RichText } from '@/components/RichText';
import { Sheet, SheetButton, useSheet, type SheetControls } from '@/components/Sheet';
import { colors, spacing } from '@/components/theme';
import { ErrorView } from '@/components/ErrorState';
import { toast } from '@/components/Toast';
import { Button, EmptyState, Loading, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { formatDate, formatShort, weekdayName } from '@/lib/dates';
import { UserFacingError } from '@/lib/errors';
import { getPublicRecipeTree } from '@/lib/publicLibrary';
import { parseRichText } from '@/lib/richText';
import { formatQuantity, type NeedsContext } from '@/lib/shopping';
import { PLATFORM_ICON, PLATFORM_LABEL, platformOf } from '@/lib/source';
import type { PublicRecipeTree, Recipe, RecipeVisibility } from '@/lib/types';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRecipe } = useData();
  // A folha é da tela: não reanima quando a receita pública termina de carregar.
  const sheet = useSheet();
  const own = getRecipe(id);
  return own ? <RecipeView recipe={own} sheet={sheet} /> : <PublicRecipeLoader id={id} sheet={sheet} />;
}

/** Receita que não está na coleção: busca na biblioteca pública. */
function PublicRecipeLoader({ id, sheet }: { id: string; sheet: SheetControls }) {
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

  if (tree) return <RecipeView recipe={tree.root} tree={tree} sheet={sheet} />;
  return (
    <Sheet anim={sheet.anim} title="Receita" onClose={sheet.dismiss}>
      {error ? (
        <ErrorView
          error={error}
          context={{ title: 'Não foi possível abrir a receita' }}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            setTick((t) => t + 1);
          }}
          actions={<Button title="Voltar" variant="ghost" onPress={sheet.dismiss} />}
        />
      ) : tree === undefined ? (
        <Loading />
      ) : (
        <EmptyState icon="lock-closed-outline" title="Receita não encontrada" subtitle="Ela pode ter sido excluída ou deixado de ser pública." />
      )}
    </Sheet>
  );
}

function RecipeView({ recipe, tree, sheet }: { recipe: Recipe; tree?: PublicRecipeTree; sheet: SheetControls }) {
  const data = useData();
  const [pickingDay, setPickingDay] = useState(false);
  const [showingIngredients, setShowingIngredients] = useState(false);
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
        sheet.dismiss();
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

  const author = (isPublicView ? tree.authorName : recipe.originAuthorName) ?? 'usuário';
  const isOwn = !isPublicView && !isSavedCopy;
  // Receitas de outras pessoas só abrem se forem públicas. As próprias: como o dono escolheu.
  // (Estar na busca do Explorar é decisão interna e não aparece aqui.)
  const visibility: RecipeVisibility = !isOwn ? 'PUBLIC' : recipe.visibility;
  // Autor clicável: abre o perfil público (só quando se sabe quem é).
  const authorId = isPublicView ? tree.authorId : null;
  const ingredients = recipe.items.filter((i) => !i.subRecipeId);
  const subItems = recipe.items.filter((i) => i.subRecipeId);
  const hasPreparation = parseRichText(recipe.preparation).length > 0;
  // Link da receita original: só o dono vê, a menos que a equipe tenha aprovado a receita (listed).
  // Cópias salvas só trazem o link quando a original estava aprovada.
  const showSource = !!recipe.sourceUrl && (isOwn || isSavedCopy || recipe.listed);
  const openSource = () =>
    Linking.openURL(recipe.sourceUrl!).catch(() => toast.error(new UserFacingError('Não foi possível abrir este link.', 'Link inválido')));

  const headerRight = isOwn ? (
    <DropdownMenu
      items={[
        {
          label: 'Editar',
          icon: 'create-outline',
          onPress: () => router.push({ pathname: '/recipe/form', params: { id: recipe.id } }),
        },
        { label: 'Excluir', icon: 'trash-outline', destructive: true, onPress: confirmDelete },
      ]}
      trigger={(open) => <SheetButton icon="ellipsis-vertical" label="Mais opções" onPress={open} />}
    />
  ) : (
    <SheetButton
      icon={isSaved ? 'bookmark' : 'bookmark-outline'}
      label={isSaved ? 'Remover do caderno' : 'Salvar no caderno'}
      active={isSaved}
      disabled={busy}
      onPress={isSaved ? confirmRemove : save}
    >
      {busy ? <ActivityIndicator color={colors.primary} size="small" /> : undefined}
    </SheetButton>
  );

  return (
    <>
      <Sheet
        anim={sheet.anim}
        kind={recipe.kind}
        title={recipe.name}
        onClose={sheet.dismiss}
        headerRight={headerRight}
        footer={
          <>
            <Button title="Adicionar à semana" icon="calendar-outline" loading={busy} onPress={() => setPickingDay(true)} />
            {showSource ? (
              <Button
                title={platform === 'site' ? 'Ver receita original' : `Ver no ${PLATFORM_LABEL[platform]}`}
                icon={PLATFORM_ICON[platform]}
                variant="ghost"
                onPress={openSource}
              />
            ) : null}
          </>
        }
      >
        <RecipeMeta
          author={isOwn ? null : author}
          authorId={authorId}
          visibility={visibility}
          date={`Em ${formatDate(recipe.createdAt)}`}
        />
        {/* Divisória entre as informações (autor, data, visibilidade) e o conteúdo */}
        <View style={styles.separator} />
        {recipe.description ? (
          <Section title="Descrição">
            <Text style={styles.body}>{recipe.description}</Text>
          </Section>
        ) : null}

        {/* Ingredientes: botão que abre o modal com os da receita e, em seguida, os preparos (clicáveis) */}
        {recipe.items.length > 0 && (
          <>
            <IngredientsButton count={recipe.items.length} onPress={() => setShowingIngredients(true)} />
            <ModalScreen visible={showingIngredients} title="Ingredientes" subtitle={recipe.name} onClose={() => setShowingIngredients(false)}>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
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
                    const caption = sub ? ['Preparo', qty, `${count} ${count === 1 ? 'item' : 'itens'}`].filter(Boolean).join(' · ') : 'Preparo indisponível';
                    return (
                      <View key={item.id}>
                        {(ingredients.length > 0 || idx > 0) && <View style={styles.separator} />}
                        <Pressable
                          disabled={!sub}
                          onPress={() => {
                            // Fecha o modal antes de navegar, senão ele fica por cima da nova tela.
                            setShowingIngredients(false);
                            router.push({ pathname: '/recipe/[id]', params: { id: item.subRecipeId! } });
                          }}
                          accessibilityRole="link"
                          accessibilityLabel={sub ? `Preparo ${sub.name}. Abrir preparo` : 'Preparo indisponível'}
                          style={({ pressed }) => [
                            styles.row,
                            { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md },
                            pressed && { backgroundColor: KIND.PREP.background },
                          ]}
                        >
                          <KindIcon kind="PREP" size={32} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.body, { fontWeight: '600', color: sub ? colors.text : colors.muted }]} numberOfLines={1}>
                              {sub?.name ?? 'Preparo'}
                            </Text>
                            <Text style={styles.muted}>{caption}</Text>
                          </View>
                          {sub && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ModalScreen>
          </>
        )}

        {hasPreparation && (
          <Section title="Modo de preparo">
            <View style={styles.card}>
              <RichText value={recipe.preparation} />
            </View>
          </Section>
        )}
      </Sheet>

      <DayPicker visible={pickingDay} title={`Planejar "${recipe.name}"`} onClose={() => setPickingDay(false)} onSelect={addToWeek} />
    </>
  );
}

const VISIBILITY: Record<RecipeVisibility, { icon: ComponentProps<typeof Ionicons>['name']; label: string; color: string }> = {
  PRIVATE: { icon: 'lock-closed-outline', label: 'Privada', color: colors.muted },
  PUBLIC: { icon: 'globe-outline', label: 'Pública', color: colors.muted },
};

/**
 * Linha de informações no topo do conteúdo: autoria ("Criado por mim" ou "Criado por fulano", que abre
 * o perfil público), data em que entrou no caderno e visibilidade (Privada / Pública).
 */
function RecipeMeta({
  author,
  authorId,
  visibility,
  date,
}: {
  author: string | null;
  authorId: string | null;
  visibility: RecipeVisibility;
  date: string;
}) {
  const v = VISIBILITY[visibility];
  const authorLabel = `Criado por ${author ?? 'mim'}`;
  return (
    <View style={[styles.row, { flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }]}>
      {authorId ? (
        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: authorId } })}
          accessibilityRole="link"
          accessibilityLabel={`${authorLabel}. Ver perfil`}
          hitSlop={8}
          style={({ pressed }) => [styles.row, local.meta, { flexShrink: 1 }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="person-outline" size={16} color={colors.muted} />
          {/* Só o nome tem cara de link; "Criado por" e o ícone ficam neutros. */}
          <Text style={local.metaText} numberOfLines={1}>
            {author ? (
              <>
                Criado por <Text style={{ color: colors.primary }}>{author}</Text>
              </>
            ) : (
              authorLabel
            )}
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.row, local.meta, { flexShrink: 1 }]}>
          <Ionicons name="person-outline" size={16} color={colors.muted} />
          <Text style={local.metaText} numberOfLines={1}>
            {authorLabel}
          </Text>
        </View>
      )}
      <View style={[styles.row, local.meta]} accessibilityLabel={date}>
        <Ionicons name="calendar-outline" size={16} color={colors.muted} />
        <Text style={local.metaText}>{date}</Text>
      </View>
      <View style={[styles.row, local.meta]}>
        <Ionicons name={v.icon} size={16} color={v.color} />
        <Text style={[local.metaText, { color: v.color }]}>{v.label}</Text>
      </View>
    </View>
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

/** Cartão "Ingredientes" com a contagem num círculo à direita; abre a lista num modal. */
function IngredientsButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ingredientes, ${count} ${count === 1 ? 'item' : 'itens'}. Ver lista`}
      style={({ pressed }) => [styles.card, styles.row, { gap: spacing.md }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <Text style={[styles.subtitle, { flex: 1 }]}>Ingredientes</Text>
      <View style={local.countCircle}>
        <Text style={local.countText}>{count}</Text>
      </View>
    </Pressable>
  );
}

const local = StyleSheet.create({
  meta: { gap: spacing.xs },
  metaText: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  qty: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  countCircle: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  countText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
