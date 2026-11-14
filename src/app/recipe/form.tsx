import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItemPicker } from '@/components/ItemPicker';
import { RichTextField } from '@/components/RichTextField';
import { colors, fonts, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { BottomBar, Button, ChipSelect, EmptyState, Field, FieldError, IconButton, Input, styles, Toggle } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { newId, nowIso } from '@/lib/ids';
import { sanitizeRichText } from '@/lib/richText';
import { allowedSubRecipes, UNITS } from '@/lib/shopping';
import { PLATFORM_LABEL, parseSource } from '@/lib/source';
import type { Ingredient, Recipe } from '@/lib/types';
import { NO_QUANTITY_UNIT, parseQuantity, recipeSchema } from '@/lib/validation';

type Row = {
  key: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  name: string;
  quantity: string;
  unit: string | null;
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

export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getRecipe } = useData();
  // Receitas salvas de outras pessoas são somente leitura.
  if (id && getRecipe(id)?.originRecipeId) {
    return <EmptyState icon="lock-closed-outline" title="Receita somente leitura" subtitle="Receitas salvas de outras pessoas não podem ser editadas." />;
  }
  return <RecipeForm />;
}

function RecipeForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useData();
  const existing = id ? data.getRecipe(id) : undefined;
  const isEdit = !!existing;
  const isCopy = !!existing?.originRecipeId;

  const [recipeId] = useState(() => existing?.id ?? newId());
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  // Receitas antigas (texto puro) já abrem convertidas em HTML no editor.
  const [initialPreparation] = useState(() => sanitizeRichText(existing?.preparation));
  const [preparation, setPreparation] = useState(initialPreparation);
  const [source, setSource] = useState(existing?.sourceUrl ?? '');
  const [submit, setSubmit] = useState(existing?.status === 'PENDING' || existing?.status === 'APPROVED');
  const [rows, setRows] = useState<Row[]>(() =>
    toRows(existing, (i) => (i.ingredientId ? data.ingredientName(i.ingredientId) : data.getRecipe(i.subRecipeId!)?.name ?? 'Receita')),
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedSource = parseSource(source);
  const allowedRecipes = useMemo(
    () => allowedSubRecipes(data.recipes, recipeId).filter((r) => !rows.some((row) => row.subRecipeId === r.id)),
    [data.recipes, recipeId, rows],
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
  const form = useFormValidation(recipeSchema, { name, description, preparation: cleanPreparation, source, items: rows });
  const { errors } = form;

  const save = async () => {
    const result = form.check();
    if (!result.ok) {
      toast.warning('Confira os campos destacados', result.first, { icon: 'alert-circle' });
      return;
    }
    const v = result.value;

    const now = nowIso();
    const recipe: Recipe = {
      id: recipeId,
      name: v.name,
      description: v.description || null,
      preparation: v.preparation || null,
      sourceUrl: parsedSource?.url ?? null,
      sourcePlatform: parsedSource?.platform ?? null,
      status: submit && !isCopy && !data.isGuest ? 'PENDING' : 'PRIVATE',
      rejectionReason: existing?.rejectionReason ?? null,
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

    setSaving(true);
    const ok = await data.saveRecipe(recipe);
    setSaving(false);
    if (!ok) return;
    toast.success(
      recipe.status === 'PENDING' ? 'Enviada para aprovação' : isEdit ? 'Alterações salvas' : 'Receita cadastrada',
      recipe.status === 'PENDING' ? 'Você já pode usá-la na sua semana. Ela é publicada depois de aprovada.' : undefined,
    );
    if (isEdit) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEdit ? 'Editar receita' : 'Nova receita',
          headerTitleAlign: 'left',
          headerTitleStyle: { fontFamily: fonts.serifSemiBold, fontSize: 21 },
        }}
      />
      {/* Divisória entre o header e o conteúdo */}
      <View style={styles.separator} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Nome *" error={errors.name}>
          <Input value={name} onChangeText={setName} placeholder="Ex.: Lasanha à bolonhesa" invalid={!!errors.name} maxLength={120} />
        </Field>
        <Field label="Descrição" error={errors.description}>
          <Input value={description} onChangeText={setDescription} placeholder="Uma breve descrição" multiline invalid={!!errors.description} maxLength={500} />
        </Field>

        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, !!errors.items && { color: colors.danger }]}>Ingredientes *</Text>
          {rows.map((row, index) => {
            const qtyError = errors[`items[${index}].quantity`];
            return row.subRecipeId ? (
              <View key={row.key} style={[styles.card, { gap: spacing.sm, borderColor: colors.olive }]}>
                <View style={styles.row}>
                  <Ionicons name="book-outline" size={18} color={colors.olive} />
                  <Text style={[styles.subtitle, { flex: 1 }]}>{row.name}</Text>
                  <IconButton name="trash-outline" label={`Remover ${row.name}`} color={colors.danger} onPress={() => removeRow(row.key)} />
                </View>
                <Text style={styles.muted}>Receita usada como ingrediente. Na lista de compras, os ingredientes dela aparecem num grupo separado.</Text>
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
          <Button title="Adicionar ingrediente ou receita" icon="add" variant="secondary" onPress={() => setPicking(true)} />
        </View>

        <Field label="Modo de preparo" error={errors.preparation}>
          <RichTextField
            initialValue={initialPreparation}
            onChange={setPreparation}
            placeholder="Descreva o passo a passo"
            invalid={!!errors.preparation}
          />
        </Field>

        <Field
          label="Link do vídeo ou receita original"
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

        <SubmitSwitch isGuest={data.isGuest} isCopy={isCopy} existing={existing} value={submit} onChange={setSubmit} />
      </ScrollView>

      <BottomBar>
        <Button title={isEdit ? 'Salvar alterações' : 'Cadastrar receita'} icon="checkmark" onPress={save} loading={saving} />
      </BottomBar>

      <ItemPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPickIngredient={addIngredient}
        onPickRecipe={addSubRecipe}
        allowedRecipes={allowedRecipes}
      />
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

/** Unidades do ingrediente no catálogo (todas, se ele não restringir). "A gosto" sempre vale. */
function unitOptions(allowed: string[] | null | undefined): readonly string[] {
  if (!allowed?.length) return UNITS;
  return allowed.includes(NO_QUANTITY_UNIT) ? allowed : [...allowed, NO_QUANTITY_UNIT];
}

function SubmitSwitch({
  isGuest,
  isCopy,
  existing,
  value,
  onChange,
}: {
  isGuest: boolean;
  isCopy: boolean;
  existing: Recipe | undefined;
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
  const wasApproved = existing?.status === 'APPROVED';
  const hint = !value
    ? wasApproved
      ? 'Ao salvar, ela deixa de ser publicada e fica visível apenas para você.'
      : 'Visível apenas para você.'
    : wasApproved
      ? 'Já está publicada. Ao salvar alterações, ela volta para análise.'
      : 'Depois de aprovada pela moderação, fica visível para outras pessoas em Explorar (as receitas usadas nela também).';
  return (
    <View style={{ gap: spacing.sm }}>
      {existing?.status === 'REJECTED' && (
        <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.dangerLight, gap: spacing.xs }]}>
          <Text style={[styles.subtitle, { color: colors.danger }]}>Não aprovada para publicação</Text>
          <Text style={styles.body}>{existing.rejectionReason || 'Sem motivo informado.'}</Text>
          <Text style={styles.muted}>Ajuste a receita e envie de novo, se quiser.</Text>
        </View>
      )}
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel="Publicar receita"
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
          <Text style={styles.subtitle}>Publicar receita</Text>
          <Text style={styles.muted}>{hint}</Text>
        </View>
        <Toggle value={value} />
      </Pressable>
    </View>
  );
}
