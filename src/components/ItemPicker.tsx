import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useData } from '@/context/DataProvider';
import { normalizeName } from '@/lib/shopping';
import type { Ingredient, Recipe } from '@/lib/types';
import { ModalScreen } from './ModalScreen';
import { colors, spacing } from './theme';
import { Badge, Button, Segmented, SearchBar, styles } from './ui';

type Tab = 'ingredients' | 'recipes';

/**
 * Escolhe um item para a receita: um ingrediente do catálogo (ou um novo)
 * ou uma das suas receitas, que vira subreceita.
 */
export function ItemPicker({
  visible,
  onClose,
  onPickIngredient,
  onPickRecipe,
  allowedRecipes,
}: {
  visible: boolean;
  onClose: () => void;
  onPickIngredient: (ingredient: Ingredient) => void;
  onPickRecipe: (recipe: Recipe) => void;
  /** Receitas que podem virar subreceita (sem a própria e sem criar ciclo). */
  allowedRecipes: Recipe[];
}) {
  const { catalog, addIngredient, findIngredientByName } = useData();
  const [tab, setTab] = useState<Tab>('ingredients');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const q = normalizeName(query);
  const ingredients = useMemo(() => catalog.filter((i) => !q || normalizeName(i.name).includes(q)), [catalog, q]);
  const recipes = useMemo(() => allowedRecipes.filter((r) => !q || normalizeName(r.name).includes(q)), [allowedRecipes, q]);
  const canCreate = tab === 'ingredients' && query.trim().length > 1 && !findIngredientByName(query);

  const close = () => {
    setQuery('');
    onClose();
  };

  const create = async () => {
    setCreating(true);
    const ingredient = await addIngredient(query);
    setCreating(false);
    if (ingredient) {
      setQuery('');
      onPickIngredient(ingredient);
    }
  };

  return (
    <ModalScreen visible={visible} title="Adicionar à receita" onClose={close}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ingredients', label: 'Ingredientes' },
            { value: 'recipes', label: 'Minhas receitas' },
          ]}
        />
        <SearchBar value={query} onChangeText={setQuery} placeholder={tab === 'ingredients' ? 'Buscar ingrediente...' : 'Buscar receita...'} />
        {canCreate && <Button title={`Cadastrar "${query.trim()}"`} icon="add" variant="secondary" loading={creating} onPress={create} />}
        {tab === 'recipes' && (
          <Text style={styles.muted}>
            Use uma receita sua como parte desta (ex.: molho bolonhesa na lasanha). Se não tiver o preparo pronto em casa, os ingredientes dela entram na lista de compras.
          </Text>
        )}
      </View>

      {tab === 'ingredients' ? (
        <FlatList
          data={ingredients}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <Row onPress={() => { setQuery(''); onPickIngredient(item); }}>
              <Text style={[styles.body, { flex: 1 }]}>{item.name}</Text>
              {item.custom && <Badge label="seu" tone="accent" />}
              {item.unit && <Text style={styles.muted}>{item.unit}</Text>}
            </Row>
          )}
          ListEmptyComponent={<Empty text="Nenhum ingrediente encontrado. Cadastre um novo acima." />}
        />
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <Row onPress={() => { setQuery(''); onPickRecipe(item); }}>
              <Ionicons name="book-outline" size={18} color={colors.primary} />
              <Text style={[styles.body, { flex: 1 }]}>{item.name}</Text>
            </Row>
          )}
          ListEmptyComponent={<Empty text="Nenhuma receita disponível. Cadastre a receita do preparo (ex.: molho) primeiro." />}
        />
      )}
    </ModalScreen>
  );
}

function Row({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: spacing.lg, paddingVertical: 14, backgroundColor: pressed ? colors.primaryLight : colors.card },
      ]}
    >
      {children}
    </Pressable>
  );
}

const Separator = () => <View style={styles.separator} />;

const Empty = ({ text }: { text: string }) => <Text style={[styles.muted, { textAlign: 'center', padding: spacing.xl }]}>{text}</Text>;
