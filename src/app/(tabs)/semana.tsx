import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { RecipePicker } from '@/components/RecipePicker';
import { ShoppingListModal } from '@/components/ShoppingListModal';
import { colors, spacing } from '@/components/theme';
import { Button, Chip, IconButton, styles } from '@/components/ui';
import { WeekNavigator } from '@/components/WeekNavigator';
import { useData } from '@/context/DataProvider';
import { addDays, formatShort, today, weekDays, weekStartOf, weekdayName } from '@/lib/dates';
import { computeGroups } from '@/lib/shopping';

export default function WeekScreen() {
  const data = useData();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const plans = useMemo(() => data.mealPlans.filter((p) => p.date >= weekStart && p.date <= weekEnd), [data.mealPlans, weekStart, weekEnd]);
  const groups = useMemo(() => computeGroups(plans.map((p) => p.recipeId), data.needsContext), [plans, data.needsContext]);

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

        <Button title="Gerar lista de compras" icon="cart-outline" onPress={() => setListOpen(true)} disabled={groups.length === 0} />
        {groups.length === 0 && (
          <Text style={[styles.muted, { textAlign: 'center' }]}>Adicione receitas aos dias para gerar a lista de compras.</Text>
        )}
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

      <ShoppingListModal visible={listOpen} onClose={() => setListOpen(false)} weekStart={weekStart} groups={groups} />
    </View>
  );
}
