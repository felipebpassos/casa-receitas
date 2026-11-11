import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { NeedsList } from '@/components/NeedsList';
import { RecipePicker } from '@/components/RecipePicker';
import { colors, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Checkbox, Chip, ChipSelect, FieldError, IconButton, Input, styles } from '@/components/ui';
import { WeekNavigator } from '@/components/WeekNavigator';
import { useData } from '@/context/DataProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { extraSchema, parseQuantity } from '@/lib/validation';
import { addDays, formatShort, today, weekDays, weekStartOf, weekdayName } from '@/lib/dates';
import { computeNeeds, formatQuantity, UNITS, type NeedItem } from '@/lib/shopping';
import type { ShoppingExtra } from '@/lib/types';

export default function WeekScreen() {
  const data = useData();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const plans = useMemo(() => data.mealPlans.filter((p) => p.date >= weekStart && p.date <= weekEnd), [data.mealPlans, weekStart, weekEnd]);
  const needs = useMemo(() => computeNeeds(plans.map((p) => p.recipeId), data.needsContext), [plans, data.needsContext]);
  const extras = data.extras.filter((e) => e.weekStart === weekStart);

  // Comprei = passa a ter em casa (Despensa) e sai da lista, com opção de desfazer.
  const bought = async (item: NeedItem) => {
    if (!(await data.setHasIngredient(item.ingredientId, true))) return;
    toast.success(`${item.name} agora está na Despensa`, undefined, {
      duration: 5000,
      action: { label: 'Desfazer', onPress: () => data.setHasIngredient(item.ingredientId, false) },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />

        {/* Plano da semana */}
        <View style={[styles.card, { padding: 0 }]}>
          {weekDays(weekStart).map((date, idx) => {
            const dayPlans = plans.filter((p) => p.date === date);
            const isToday = date === today();
            return (
              <View key={date}>
                {idx > 0 && <View style={styles.separator} />}
                <View style={[styles.row, { padding: spacing.md, alignItems: 'flex-start' }]}>
                  <View style={{ width: 64 }}>
                    <Text style={[styles.body, { fontWeight: '700' }, isToday && { color: colors.primary }]}>{weekdayName(date).slice(0, 3)}</Text>
                    <Text style={styles.muted}>{formatShort(date)}</Text>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center', minHeight: 32 }}>
                    {dayPlans.length === 0 && <Text style={styles.muted}>Livre</Text>}
                    {dayPlans.map((p) => {
                      const recipe = data.getRecipe(p.recipeId);
                      return (
                        <Chip
                          key={p.id}
                          label={recipe?.name ?? 'Receita removida'}
                          onPress={recipe ? () => router.push({ pathname: '/recipe/[id]', params: { id: p.recipeId } }) : undefined}
                          onRemove={() => data.removeMealPlan(p.id)}
                        />
                      );
                    })}
                  </View>
                  <IconButton name="add-circle" label={`Adicionar receita em ${weekdayName(date)}`} color={colors.primary} size={28} onPress={() => setPickingFor(date)} />
                </View>
              </View>
            );
          })}
        </View>

        {/* O que comprar */}
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Ionicons name="cart-outline" size={22} color={colors.text} />
          <Text style={[styles.subtitle, { flex: 1 }]}>O que comprar nesta semana</Text>
        </View>
        <View style={[styles.card, { paddingVertical: spacing.xs }]}>
          {plans.length === 0 ? (
            <Text style={[styles.muted, { paddingVertical: spacing.md }]}>Adicione receitas aos dias para ver o que precisa comprar.</Text>
          ) : needs.length === 0 ? (
            <View style={[styles.row, { paddingVertical: spacing.md }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={styles.body}>Você tem tudo para as receitas da semana!</Text>
            </View>
          ) : (
            <>
              <NeedsList items={needs} onBought={bought} />
              <Text style={[styles.muted, { paddingVertical: spacing.sm }]}>Marque o que comprou: o item passa a constar como “tenho” na Despensa.</Text>
            </>
          )}
        </View>

        {/* Avulsos */}
        <Text style={[styles.label, { marginTop: spacing.sm }]}>Outros itens</Text>
        {extras.length > 0 && (
          <View style={[styles.card, { padding: 0 }]}>
            {extras.map((e, idx) => (
              <View key={e.id}>
                {idx > 0 && <View style={styles.separator} />}
                <ExtraRow extra={e} onToggle={() => data.setExtraPurchased(e.id, !e.purchased)} onRemove={() => data.deleteExtra(e.id)} />
              </View>
            ))}
          </View>
        )}
        <ExtraForm onAdd={(name, quantity, unit) => data.addExtra(weekStart, name, quantity, unit)} />
      </ScrollView>

      <RecipePicker
        visible={!!pickingFor}
        title={pickingFor ? `${weekdayName(pickingFor)}, ${formatShort(pickingFor)}` : ''}
        onClose={() => setPickingFor(null)}
        onSelect={(recipe) => {
          const date = pickingFor!;
          setPickingFor(null);
          data.addMealPlan(date, recipe.id);
        }}
      />
    </View>
  );
}

function ExtraRow({ extra, onToggle, onRemove }: { extra: ShoppingExtra; onToggle: () => void; onRemove: () => void }) {
  const qty = formatQuantity(extra.quantity, extra.unit);
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: extra.purchased }} style={[styles.row, { padding: spacing.md, gap: spacing.md }]}>
      <Checkbox checked={extra.purchased} />
      <Text style={[styles.body, { flex: 1 }, extra.purchased && { textDecorationLine: 'line-through', color: colors.muted }]}>
        {extra.name}
        {qty ? <Text style={{ fontWeight: '700' }}>{`  ${qty}`}</Text> : null}
      </Text>
      <IconButton name="close" label={`Remover ${extra.name}`} onPress={onRemove} />
    </Pressable>
  );
}

function ExtraForm({ onAdd }: { onAdd: (name: string, quantity: number | null, unit: string | null) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string | null>(null);

  const form = useFormValidation(extraSchema, { name, quantity, unit });
  const { errors } = form;

  const submit = async () => {
    const result = form.check();
    if (!result.ok) return;
    const q = parseQuantity(result.value.quantity);
    const ok = await onAdd(result.value.name, q, q != null ? unit : null);
    if (ok) {
      setName('');
      setQuantity('');
      setUnit(null);
      form.reset();
    }
  };

  return (
    <View style={[styles.card, { gap: spacing.sm }]}>
      <View style={styles.row}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Detergente"
          style={{ flex: 1 }}
          onSubmitEditing={submit}
          returnKeyType="done"
          invalid={!!errors.name}
          maxLength={80}
        />
        <Input value={quantity} onChangeText={setQuantity} placeholder="Qtd." keyboardType="decimal-pad" style={{ width: 70 }} invalid={!!errors.quantity} />
        <IconButton name="add-circle" label="Adicionar item" color={name.trim() ? colors.primary : colors.border} size={34} onPress={submit} />
      </View>
      <FieldError message={errors.name ?? errors.quantity} />
      {quantity.trim().length > 0 && <ChipSelect options={UNITS} value={unit} onChange={setUnit} />}
    </View>
  );
}
