import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useData } from '@/context/DataProvider';
import { normalizeSearch } from '@/lib/shopping';
import type { Recipe } from '@/lib/types';
import { ModalScreen } from './ModalScreen';
import { KindIcon } from './RecipeKind';
import { colors, spacing } from './theme';
import { SearchBar, styles } from './ui';

/** Escolhe uma receita da sua coleção (para a semana). */
export function RecipePicker({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (recipe: Recipe) => void;
}) {
  const { recipes, ingredientName } = useData();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return recipes;
    return recipes.filter(
      (r) => normalizeSearch(r.name).includes(q) || r.items.some((i) => i.ingredientId && normalizeSearch(ingredientName(i.ingredientId)).includes(q)),
    );
  }, [recipes, query, ingredientName]);

  return (
    <ModalScreen
      visible={visible}
      title={title}
      onClose={() => {
        setQuery('');
        onClose();
      }}
    >
      <View style={{ padding: spacing.lg }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar por nome ou ingrediente..." />
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setQuery('');
              onSelect(item);
            }}
            style={({ pressed }) => [
              styles.row,
              { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14, backgroundColor: pressed ? colors.primaryLight : colors.card },
            ]}
          >
            <KindIcon kind={item.kind} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.originAuthorName ? <Text style={styles.muted}>por {item.originAuthorName}</Text> : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.muted, { textAlign: 'center', padding: spacing.xl }]}>
            {recipes.length === 0 ? 'Seu caderno de receitas está vazio. Cadastre ou salve receitas na aba Receitas.' : 'Nenhuma receita encontrada.'}
          </Text>
        }
      />
    </ModalScreen>
  );
}
