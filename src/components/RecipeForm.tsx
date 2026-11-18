import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useData } from '@/context/DataProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { haptic } from '@/lib/haptics';
import { newId, nowIso } from '@/lib/ids';
import { loadLastPublish, saveLastPublish } from '@/lib/publishPreference';
import { sanitizeRichText } from '@/lib/richText';
import { allowedSubRecipes, UNITS } from '@/lib/shopping';
import { PLATFORM_LABEL, parseSource } from '@/lib/source';
import type { Ingredient, Recipe, RecipeKind } from '@/lib/types';
import { NO_QUANTITY_UNIT, parseQuantity, recipeSchema, type FieldErrors } from '@/lib/validation';
import { ItemPicker } from './ItemPicker';
import { KIND, KindIcon } from './RecipeKind';
import { RecipePreview } from './RecipePreview';
import { RichTextField } from './RichTextField';
import { SaveCelebration } from './SaveCelebration';
import { colors, spacing } from './theme';
import { toast } from './Toast';
import { Button, ChipSelect, Field, FieldError, IconButton, Input, styles, Toggle } from './ui';
import { Sheet, useSheet } from './Sheet';


type Row = {
  key: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  name: string;
  quantity: string;
  unit: string | null;
};

/** Etapas do cadastro (a edição continua numa tela só). */
type Step = 1 | 2 | 3;
const STEP_TITLE: Record<2 | 3, string> = { 2: 'Instruções (opcional)', 3: 'Publicar' };
/** Campos validados ao avançar de cada etapa. */
const STEP_FIELDS: Record<1 | 2, (path: string) => boolean> = {
  1: (p) => p === 'name' || p === 'description' || p === 'items' || p.startsWith('items['),
  2: (p) => p === 'preparation' || p === 'source',
};

const toRows = (recipe: Recipe | undefined, nameOf: (r: Recipe['items'][number]) => string): Row[] =>
  (recipe?.items ?? []).map((i) => ({
    key: i.id,
    ingredientId: i.ingredientId,
    subRecipeId: i.subRecipeId,
    name: nameOf(i),
    quantity: i.quantity != null ? String(i.quantity).replace('.', ',') : '',
    unit: i.unit,
  }));

/**
 * Formulário de receita/preparo.
 * - Edição (`existing`): tela única, como sempre foi.
 * - Cadastro: folha em 3 etapas (nome → ingredientes e preparo → prévia e publicar).
 */
export function RecipeForm({ existing, initialKind }: { existing?: Recipe; initialKind?: RecipeKind }) {
  const data = useData();
  const isEdit = !!existing;
  const isCopy = !!existing?.originRecipeId;
  // O tipo vem do "+" ao criar e não muda depois.
  const [kind] = useState<RecipeKind>(() => existing?.kind ?? initialKind ?? 'RECIPE');
  const meta = KIND[kind];
  const isPrep = kind === 'PREP';

  const [recipeId] = useState(() => existing?.id ?? newId());
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  // Receitas antigas (texto puro) já abrem convertidas em HTML no editor.
  const [initialPreparation] = useState(() => sanitizeRichText(existing?.preparation));
  const [preparation, setPreparation] = useState(initialPreparation);
  const [source, setSource] = useState(existing?.sourceUrl ?? '');
  const [isPublic, setIsPublic] = useState(existing?.visibility === 'PUBLIC');
  const [rows, setRows] = useState<Row[]>(() =>
    toRows(existing, (i) => (i.ingredientId ? data.ingredientName(i.ingredientId) : data.getRecipe(i.subRecipeId!)?.name ?? 'Receita')),
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- só no cadastro
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [shakeSignal, setShakeSignal] = useState(0);
  /** Para onde ir ao sair do cadastro (fechar ou abrir a receita criada). */
  const [exit, setExit] = useState<'back' | { recipeId: string } | null>(null);
  const [celebration, setCelebration] = useState<{ title: string; subtitle?: string; recipeId: string } | null>(null);
  // Texto inicial do editor ao (re)montar a etapa 2: o que já foi escrito até então.
  const [editorSeed, setEditorSeed] = useState(initialPreparation);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sheet = useSheet();

  // Cadastro: o "publicar" começa com a última escolha feita (privado se nunca cadastrou).
  const touchedPublic = useRef(false);
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    loadLastPublish().then((v) => {
      if (!cancelled && !touchedPublic.current) setIsPublic(v);
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit]);
  const changePublic = (v: boolean) => {
    touchedPublic.current = true;
    haptic.tap();
    setIsPublic(v);
  };

  const parsedSource = parseSource(source);
  // Preparos levam só ingredientes; receitas podem usar preparos.
  const allowedPreps = useMemo(
    () => (isPrep ? [] : allowedSubRecipes(data.recipes, recipeId).filter((r) => !rows.some((row) => row.subRecipeId === r.id))),
    [isPrep, data.recipes, recipeId, rows],
  );

  const addIngredient = (ingredient: Ingredient) => {
    setPicking(false);
    const unit = ingredient.unit ?? ingredient.allowedUnits?.[0] ?? 'unidade';
    setRows((prev) => [...prev, { key: newId(), ingredientId: ingredient.id, subRecipeId: null, name: ingredient.name, quantity: '', unit }]);
  };

  const addSubRecipe = (recipe: Recipe) => {
    setPicking(false);
    setRows((prev) => [...prev, { key: newId(), ingredientId: null, subRecipeId: recipe.id, name: recipe.name, quantity: '', unit: null }]);
  };

  const updateRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const cleanPreparation = useMemo(() => sanitizeRichText(preparation), [preparation]);
  const canPublish = !isCopy && !data.isGuest;
  const willPublish = isPublic && canPublish;
  const form = useFormValidation(recipeSchema, { name, description, preparation: cleanPreparation, source, items: rows });
  const { errors } = form;

  /** Algo a corrigir: aviso, vibração e (no cadastro) um tremidinho na folha. */
  const complain = (title: string, message: string) => {
    toast.warning(title, message, { icon: 'alert-circle' });
    if (!isEdit) {
      haptic.warning();
      setShakeSignal((n) => n + 1);
    }
  };

  /** Preparo antigo que ainda usa outro preparo: precisa tirar antes de salvar. */
  const nestedPrep = () => {
    const nested = isPrep ? rows.find((r) => r.subRecipeId) : undefined;
    if (nested) complain('Preparos levam só ingredientes', `Remova "${nested.name}" para salvar.`);
    return !!nested;
  };

  const buildRecipe = (v: { name: string; description: string; preparation: string }): Recipe => {
    const now = nowIso();
    return {
      id: recipeId,
      kind,
      name: v.name,
      description: v.description || null,
      preparation: v.preparation || null,
      sourceUrl: parsedSource?.url ?? null,
      sourcePlatform: parsedSource?.platform ?? null,
      visibility: willPublish ? 'PUBLIC' : 'PRIVATE',
      listed: existing?.listed ?? false,
      originRecipeId: existing?.originRecipeId ?? null,
      originAuthorName: existing?.originAuthorName ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      items: rows.map((r) => {
        const quantity = r.unit === NO_QUANTITY_UNIT ? null : parseQuantity(r.quantity);
        return {
          id: r.key,
          ingredientId: r.ingredientId,
          subRecipeId: r.subRecipeId,
          quantity,
          unit: r.ingredientId ? r.unit : quantity != null ? r.unit : null,
        };
      }),
    };
  };

  const save = async () => {
    const result = form.check();
    if (!result.ok) {
      complain('Confira os campos destacados', result.first);
      return;
    }
    if (nestedPrep()) return;
    const recipe = buildRecipe(result.value);

    setSaving(true);
    const ok = await data.saveRecipe(recipe);
    setSaving(false);
    if (!ok) return;
    const published = recipe.visibility === 'PUBLIC' && existing?.visibility !== 'PUBLIC';
    const publishedText = `Agora ${isPrep ? 'ele aparece' : 'ela aparece'} no seu perfil para quem visitar.`;

    if (isEdit) {
      toast.success(published ? (isPrep ? 'Preparo publicado' : 'Receita publicada') : 'Alterações salvas', published ? publishedText : undefined);
      sheet.dismiss();
      return;
    }
    if (canPublish) saveLastPublish(isPublic);
    haptic.success();
    setCelebration({
      title: published ? (isPrep ? 'Preparo publicado!' : 'Receita publicada!') : isPrep ? 'Preparo cadastrado!' : 'Receita cadastrada!',
      subtitle: published ? publishedText : `"${recipe.name}" já está no seu caderno.`,
      recipeId: recipe.id,
    });
  };

  const goTo = (next: Step) => {
    if (next === 2) setEditorSeed(preparation);
    setDirection(next > step ? 1 : -1);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  /** Fecha a folha com animação e depois a tela. */
  const close = () => sheet.close(() => setExit('back'));

  // Cadastro: voltar (botão do Android, gesto) volta uma etapa; na primeira, fecha a folha.
  usePreventRemove(!isEdit && !exit, () => {
    if (celebration) return;
    if (step > 1) goTo((step - 1) as Step);
    else close();
  });

  // Saindo: o bloqueio acima já foi desligado (exit != null), então navega.
  useEffect(() => {
    if (!exit) return;
    if (exit === 'back') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
    else router.replace({ pathname: '/recipe/[id]', params: { id: exit.recipeId } });
  }, [exit]);

  /** Avança só se os campos da etapa atual estiverem certos. */
  const next = () => {
    if (step === 3) return;
    const result = form.check();
    const stepErrors: FieldErrors = result.ok ? {} : pick(result.errors, STEP_FIELDS[step]);
    const first = Object.values(stepErrors)[0];
    if (first) {
      complain('Confira os campos destacados', first);
      return;
    }
    if (step === 1 && nestedPrep()) return;
    // A próxima etapa começa sem erros; eles voltam ao tentar avançar de novo.
    form.reset();
    haptic.step();
    goTo((step + 1) as Step);
  };

  const nameFields = (
    <>
      <Field label="Nome *" error={errors.name}>
        <Input value={name} onChangeText={setName} placeholder={meta.namePlaceholder} invalid={!!errors.name} maxLength={120} />
      </Field>
      <Field label="Descrição" optional error={errors.description}>
        <Input value={description} onChangeText={setDescription} placeholder="Uma breve descrição" multiline invalid={!!errors.description} maxLength={500} />
      </Field>
    </>
  );

  const ingredientFields = (
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.label, !!errors.items && { color: colors.danger }]}>Ingredientes *</Text>
        {rows.map((row, index) => {
          const qtyError = errors[`items[${index}].quantity`];
          return row.subRecipeId ? (
            <View key={row.key} style={[styles.card, { gap: spacing.sm, borderColor: isPrep ? colors.danger : KIND.PREP.color }]}>
              <View style={styles.row}>
                <KindIcon kind="PREP" size={28} />
                <Text style={[styles.subtitle, { flex: 1 }]}>{row.name}</Text>
                <IconButton name="trash-outline" label={`Remover ${row.name}`} color={colors.danger} onPress={() => removeRow(row.key)} />
              </View>
              {isPrep ? (
                <FieldError message="Preparos levam só ingredientes. Remova este item para salvar." />
              ) : (
                <Text style={styles.muted}>Preparo usado como ingrediente. Na lista de compras, os ingredientes dele aparecem num grupo separado.</Text>
              )}
              <View style={styles.row}>
                <Input
                  value={row.quantity}
                  onChangeText={(t) => updateRow(row.key, { quantity: t })}
                  placeholder="Qtd. (opcional)"
                  keyboardType="decimal-pad"
                  invalid={!!qtyError}
                  style={{ width: 130 }}
                />
                {row.quantity.trim().length > 0 && (
                  <View style={{ flex: 1 }}>
                    <ChipSelect options={UNITS} value={row.unit} onChange={(u) => updateRow(row.key, { unit: u })} />
                  </View>
                )}
              </View>
              <FieldError message={qtyError} />
            </View>
          ) : (
            <View key={row.key} style={[styles.card, { gap: spacing.sm }, !!qtyError && { borderColor: colors.danger }]}>
              <View style={styles.row}>
                <Text style={[styles.subtitle, { flex: 1 }]}>{row.name}</Text>
                <IconButton name="trash-outline" label={`Remover ${row.name}`} color={colors.danger} onPress={() => removeRow(row.key)} />
              </View>
              <View style={styles.row}>
                {row.unit !== NO_QUANTITY_UNIT && (
                  <Input
                    value={row.quantity}
                    onChangeText={(t) => updateRow(row.key, { quantity: t })}
                    placeholder="Qtd."
                    keyboardType="decimal-pad"
                    invalid={!!qtyError}
                    style={{ width: 80 }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <ChipSelect
                    options={unitOptions(data.getIngredient(row.ingredientId!)?.allowedUnits)}
                    value={row.unit}
                    onChange={(u) => updateRow(row.key, { unit: u })}
                  />
                </View>
              </View>
              <FieldError message={qtyError} />
            </View>
          );
        })}
        <FieldError message={errors.items} />
        <Button title={isPrep ? 'Adicionar ingrediente' : 'Adicionar ingrediente ou preparo'} icon="add" variant="secondary" onPress={() => setPicking(true)} />
      </View>
  );

  const prepFields = (
    <>
      <Field label="Modo de preparo" optional error={errors.preparation}>
        {/* No cadastro o editor remonta ao voltar para esta etapa: abre com o texto atual. */}
        <RichTextField
          initialValue={isEdit ? initialPreparation : editorSeed}
          onChange={setPreparation}
          placeholder="Descreva o passo a passo"
          invalid={!!errors.preparation}
        />
      </Field>

      <Field
        label="Link da receita original"
        optional
        error={errors.source}
        hint={parsedSource ? `Origem: ${PLATFORM_LABEL[parsedSource.platform]}` : undefined}
      >
        <Input
          value={source}
          onChangeText={setSource}
          placeholder="YouTube, Instagram, TikTok, site..."
          autoCapitalize="none"
          keyboardType="url"
          invalid={!!errors.source}
        />
      </Field>
    </>
  );

  const visibilitySwitch = (
    <VisibilitySwitch kind={kind} isGuest={data.isGuest} isAdmin={data.isAdmin} isCopy={isCopy} value={isPublic} onChange={changePublic} />
  );

  const itemPicker = (
    <ItemPicker
      visible={picking}
      onClose={() => setPicking(false)}
      onPickIngredient={addIngredient}
      onPickRecipe={addSubRecipe}
      allowPreps={!isPrep}
      allowedPreps={allowedPreps}
    />
  );

  if (isEdit) {
    return (
      <>
        <Sheet
          anim={sheet.anim}
          kind={kind}
          title={meta.editTitle}
          onClose={sheet.dismiss}
          footer={<Button title="Salvar alterações" icon="checkmark" onPress={save} loading={saving} />}
        >
          {nameFields}
          {ingredientFields}
          {prepFields}
          {visibilitySwitch}
        </Sheet>
        {itemPicker}
      </>
    );
  }

  return (
    <>
      <Sheet
        anim={sheet.anim}
        kind={kind}
        animateIcon
        title={step === 1 ? meta.newTitle : `${step}. ${STEP_TITLE[step]}`}
        step={step}
        direction={direction}
        shakeSignal={shakeSignal}
        onBack={step > 1 && !celebration ? () => goTo((step - 1) as Step) : undefined}
        onClose={celebration ? () => undefined : close}
        swipeToClose={!celebration}
        scrollRef={scrollRef}
        footer={
          step < 3 ? (
            <Button title="Continuar" onPress={next} />
          ) : (
            <>
              {visibilitySwitch}
              <Button title={`Cadastrar ${meta.label.toLowerCase()}`} icon="checkmark" onPress={save} loading={saving} />
            </>
          )
        }
        overlay={
          celebration ? (
            <SaveCelebration
              kind={kind}
              title={celebration.title}
              subtitle={celebration.subtitle}
              onDone={() => setExit({ recipeId: celebration.recipeId })}
            />
          ) : null
        }
      >
        {step === 1 && (
          <>
            {nameFields}
            {ingredientFields}
          </>
        )}
        {step === 2 && prepFields}
        {step === 3 && (
          <>
            <Text style={styles.muted}>Confira como vai ficar. Dá para editar depois, quando quiser.</Text>
            <View style={[styles.card, { borderColor: meta.color, borderWidth: 1.5 }]}>
              <RecipePreview
                recipe={buildRecipe({ name: name.trim(), description: description.trim(), preparation: cleanPreparation })}
                subRecipeName={(sid) => rows.find((r) => r.subRecipeId === sid)?.name ?? 'Preparo'}
              />
            </View>
          </>
        )}
      </Sheet>
      {itemPicker}
    </>
  );
}

const local = StyleSheet.create({
  publishIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Só os erros cujos caminhos passam no filtro. */
function pick(errors: FieldErrors, keep: (path: string) => boolean): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([path]) => keep(path)));
}

/** Unidades do ingrediente no catálogo (todas, se ele não restringir). "A gosto" sempre vale. */
function unitOptions(allowed: string[] | null | undefined): readonly string[] {
  if (!allowed?.length) return UNITS;
  return allowed.includes(NO_QUANTITY_UNIT) ? allowed : [...allowed, NO_QUANTITY_UNIT];
}

function VisibilitySwitch({
  kind,
  isGuest,
  isAdmin,
  isCopy,
  value,
  onChange,
}: {
  kind: RecipeKind;
  isGuest: boolean;
  isAdmin: boolean;
  isCopy: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  if (isCopy) {
    return <Text style={styles.muted}>Receitas salvas de outras pessoas ficam só no seu caderno de receitas e não podem ser publicadas.</Text>;
  }
  if (isGuest) {
    return (
      <Pressable onPress={() => router.push('/account')} style={[styles.card, styles.row]}>
        <Ionicons name="globe-outline" size={20} color={colors.muted} />
        <Text style={[styles.muted, { flex: 1 }]}>Para publicar receitas, entre na sua conta.</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    );
  }
  const prep = kind === 'PREP';
  // Título mostra o estado atual; o texto explica o que muda ao ligar/desligar.
  const title = value ? (prep ? 'Público' : 'Pública') : prep ? 'Privado' : 'Privada';
  const hint = !value
    ? 'Ative para publicar no seu perfil.'
    : `Visível no seu perfil${prep ? '' : ' (os preparos usados também)'}${isAdmin ? ' e na busca do Explorar' : ''}.`;
  const a11yLabel = `Publicar ${KIND[kind].label.toLowerCase()}`;
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => [
          styles.card,
          styles.row,
          { gap: spacing.md },
          value && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={[local.publishIcon, value && { backgroundColor: colors.card }]}>
          <Ionicons name={value ? 'globe-outline' : 'lock-closed-outline'} size={20} color={value ? colors.primary : colors.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.subtitle}>{title}</Text>
          <Text style={styles.muted}>{hint}</Text>
        </View>
        <Toggle value={value} />
      </Pressable>
    </View>
  );
}
