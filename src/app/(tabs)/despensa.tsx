import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { colors, spacing } from '@/components/theme';
import { Badge, Button, Checkbox, EmptyState, SearchBar, Segmented, styles } from '@/components/ui';
import { useData } from '@/context/DataProvider';
import { normalizeName, subRecipeIds } from '@/lib/shopping';

type Filter = 'all' | 'have' | 'missing';

type Entry = { kind: 'ingredient' | 'recipe'; id: string; name: string; custom?: boolean; has: boolean };

export default function PantryScreen() {
  const data = useData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);

  const sections = useMemo(() => {
    const q = normalizeName(query);
    const keep = (e: Entry) =>
      (!q || normalizeName(e.name).includes(q)) && (filter === 'all' || (filter === 'have' ? e.has : !e.has));

    // Preparos = receitas suas usadas dentro de outras receitas (ex.: molho bolonhesa).
    const prepIds = subRecipeIds(data.recipes);
    const preps: Entry[] = data.recipes
      .filter((r) => prepIds.has(r.id))
      .map((r) => ({ kind: 'recipe', id: r.id, name: r.name, has: data.pantryRecipes.has(r.id) }));
    const ingredients: Entry[] = data.catalog.map((i) => ({
      kind: 'ingredient',
      id: i.id,
      name: i.name,
      custom: i.custom,
      has: data.pantryIngredients.has(i.id),
    }));

    return [
      { title: 'Preparos', subtitle: 'Receitas usadas em outras receitas', data: preps.filter(keep) },
      { title: 'Ingredientes', subtitle: null, data: ingredients.filter(keep) },
    ].filter((s) => s.data.length > 0);
  }, [data.recipes, data.catalog, data.pantryRecipes, data.pantryIngredients, query, filter]);

  const haveCount = data.pantryIngredients.size + data.pantryRecipes.size;
  const canCreate = query.trim().length > 1 && !data.findIngredientByName(query);

  const toggle = (e: Entry) => (e.kind === 'recipe' ? data.setHasRecipe(e.id, !e.has) : data.setHasIngredient(e.id, !e.has));

  const createAndMark = async () => {
    setCreating(true);
    const ingredient = await data.addIngredient(query);
    if (ingredient) {
      await data.setHasIngredient(ingredient.id, true);
      setQuery('');
    }
    setCreating(false);
  };

  return (
    <View style={styles.screen}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar na despensa..." />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'have', label: `Tenho (${haveCount})` },
            { value: 'missing', label: 'Não tenho' },
          ]}
        />
        {canCreate && <Button title={`Adicionar "${query.trim()}"`} icon="add" variant="secondary" loading={creating} onPress={createAndMark} />}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => `${e.kind}:${e.id}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.background }}>
            <Text style={styles.label}>{section.title}</Text>
            {section.subtitle && <Text style={styles.muted}>{section.subtitle}</Text>}
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggle(item)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.has }}
            style={({ pressed }) => [
              styles.row,
              { paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.md, backgroundColor: pressed ? colors.primaryLight : colors.card },
            ]}
          >
            <Checkbox checked={item.has} />
            {item.kind === 'recipe' && <Ionicons name="book-outline" size={16} color={colors.primary} />}
            <Text style={[styles.body, { flex: 1 }, !item.has && { color: colors.muted }]}>{item.name}</Text>
            {item.custom && <Badge label="seu" tone="accent" />}
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="basket-outline"
            title={query ? 'Nada encontrado' : filter === 'have' ? 'Nada marcado ainda' : 'Tudo marcado!'}
            subtitle={query ? 'Use o botão acima para adicionar um item novo.' : filter === 'have' ? 'Toque nos itens que você tem em casa.' : undefined}
          />
        }
      />
    </View>
  );
}
