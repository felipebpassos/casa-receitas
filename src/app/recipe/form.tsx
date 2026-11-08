import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ItemPicker } from '@/components/ItemPicker';
import { colors, spacing } from '@/components/theme';
import { Button, ChipSelect, Field, IconButton, Input, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { newId, nowIso } from '@/lib/ids';
import { allowedSubRecipes, UNITS } from '@/lib/shopping';
import { PLATFORM_LABEL, parseSource } from '@/lib/source';
import type { Ingredient, Recipe } from '@/lib/types';

type Row = {
  key: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  name: string;
  quantity: string;
  unit: string | null;
};

function parseQuantity(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

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
  const data = useData();
  const existing = id ? data.getRecipe(id) : undefined;
  const isEdit = !!existing;
  const isCopy = !!existing?.originRecipeId;

  const [recipeId] = useState(() => existing?.id ?? newId());
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [preparation, setPreparation] = useState(existing?.preparation ?? '');
  const [source, setSource] = useState(existing?.sourceUrl ?? '');
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? false);
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
    setRows((prev) => [...prev, { key: newId(), ingredientId: ingredient.id, subRecipeId: null, name: ingredient.name, quantity: '', unit: ingredient.unit ?? 'unidade' }]);
  };

  const addSubRecipe = (recipe: Recipe) => {
    setPicking(false);
    setRows((prev) => [...prev, { key: newId(), ingredientId: null, subRecipeId: recipe.id, name: recipe.name, quantity: '', unit: null }]);
  };

  const updateRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const save = async () => {
    if (!name.trim()) return Alert.alert('Nome obrigatório', 'Dê um nome para a receita.');
    if (rows.length === 0) return Alert.alert('Ingredientes', 'Adicione ao menos um ingrediente.');
    const invalid = rows.find((r) => r.ingredientId && r.unit !== 'a gosto' && parseQuantity(r.quantity) == null);
    if (invalid) return Alert.alert('Quantidade', `Informe a quantidade de "${invalid.name}" (ou use a unidade "a gosto").`);
    if (source.trim() && !parsedSource) return Alert.alert('Link inválido', 'Confira o link do vídeo ou da receita original.');

    const now = nowIso();
    const recipe: Recipe = {
      id: recipeId,
      name: name.trim(),
      description: description.trim() || null,
      preparation: preparation.trim() || null,
      sourceUrl: parsedSource?.url ?? null,
      sourcePlatform: parsedSource?.platform ?? null,
      isPublic: isPublic && !isCopy && !data.isGuest,
      originRecipeId: existing?.originRecipeId ?? null,
      originAuthorName: existing?.originAuthorName ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      items: rows.map((r) => {
        const quantity = r.unit === 'a gosto' ? null : parseQuantity(r.quantity);
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
    if (isEdit) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  };

  return (
    <>
      <Stack.Screen options={{ title: isEdit ? 'Editar receita' : 'Nova receita' }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        <Field label="Nome *">
          <Input value={name} onChangeText={setName} placeholder="Ex.: Lasanha à bolonhesa" />
        </Field>
        <Field label="Descrição">
          <Input value={description} onChangeText={setDescription} placeholder="Uma breve descrição" multiline />
        </Field>

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>Ingredientes *</Text>
          {rows.map((row) =>
            row.subRecipeId ? (
              <View key={row.key} style={[styles.card, { gap: spacing.sm, borderColor: colors.primary }]}>
                <View style={styles.row}>
                  <Ionicons name="book-outline" size={18} color={colors.primary} />
                  <Text style={[styles.subtitle, { flex: 1 }]}>{row.name}</Text>
                  <IconButton name="trash-outline" label={`Remover ${row.name}`} color={colors.danger} onPress={() => removeRow(row.key)} />
                </View>
                <Text style={styles.muted}>Receita usada como ingrediente. Se não tiver pronta em casa, os ingredientes dela entram na lista.</Text>
                <View style={styles.row}>
                  <Input value={row.quantity} onChangeText={(t) => updateRow(row.key, { quantity: t })} placeholder="Qtd. (opcional)" keyboardType="decimal-pad" style={{ width: 130 }} />
                  {row.quantity.trim().length > 0 && (
                    <View style={{ flex: 1 }}>
                      <ChipSelect options={UNITS} value={row.unit} onChange={(u) => updateRow(row.key, { unit: u })} />
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View key={row.key} style={[styles.card, { gap: spacing.sm }]}>
                <View style={styles.row}>
                  <Text style={[styles.subtitle, { flex: 1 }]}>{row.name}</Text>
                  <IconButton name="trash-outline" label={`Remover ${row.name}`} color={colors.danger} onPress={() => removeRow(row.key)} />
                </View>
                <View style={styles.row}>
                  {row.unit !== 'a gosto' && (
                    <Input value={row.quantity} onChangeText={(t) => updateRow(row.key, { quantity: t })} placeholder="Qtd." keyboardType="decimal-pad" style={{ width: 80 }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <ChipSelect options={UNITS} value={row.unit} onChange={(u) => updateRow(row.key, { unit: u })} />
                  </View>
                </View>
              </View>
            ),
          )}
          <Button title="Adicionar ingrediente ou receita" icon="add" variant="secondary" onPress={() => setPicking(true)} />
        </View>

        <Field label="Modo de preparo">
          <Input value={preparation} onChangeText={setPreparation} placeholder="Descreva o passo a passo" multiline style={{ minHeight: 140, textAlignVertical: 'top' }} />
        </Field>

        <Field label="Link do vídeo ou receita original">
          <Input value={source} onChangeText={setSource} placeholder="YouTube, Instagram, TikTok, site..." autoCapitalize="none" keyboardType="url" />
          {parsedSource && <Text style={styles.muted}>Origem: {PLATFORM_LABEL[parsedSource.platform]}</Text>}
        </Field>

        <PublicSwitch isGuest={data.isGuest} isCopy={isCopy} value={isPublic} onChange={setIsPublic} />

        <Button title={isEdit ? 'Salvar alterações' : 'Cadastrar receita'} icon="checkmark" onPress={save} loading={saving} />
      </ScrollView>

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

function PublicSwitch({ isGuest, isCopy, value, onChange }: { isGuest: boolean; isCopy: boolean; value: boolean; onChange: (v: boolean) => void }) {
  if (isCopy) {
    return <Text style={styles.muted}>Receitas salvas de outras pessoas ficam só na sua coleção e não podem ser publicadas.</Text>;
  }
  if (isGuest) {
    return (
      <Pressable onPress={() => router.push('/account')} style={[styles.card, styles.row]}>
        <Ionicons name="globe-outline" size={20} color={colors.muted} />
        <Text style={[styles.muted, { flex: 1 }]}>Para publicar receitas na biblioteca, entre na sua conta.</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, styles.row]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.subtitle}>Receita pública</Text>
        <Text style={styles.muted}>
          {value ? 'Aparece na biblioteca para outras pessoas (as receitas usadas nela também).' : 'Visível apenas para você.'}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}
