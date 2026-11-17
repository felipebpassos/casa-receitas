import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useData } from '@/context/DataProvider';
import { useFormValidation } from '@/hooks/useFormValidation';
import { normalizeSearch, UNITS } from '@/lib/shopping';
import type { Ingredient, Recipe } from '@/lib/types';
import { suggestionSchema } from '@/lib/validation';
import { ModalScreen } from './ModalScreen';
import { KIND, KindIcon } from './RecipeKind';
import { colors, spacing } from './theme';
import { toast } from './Toast';
import { Button, ChipSelect, Field, Input, Segmented, SearchBar, styles } from './ui';

type Tab = 'ingredients' | 'preps';

/**
 * Escolhe um item: um ingrediente do catálogo ou (só em receitas) um dos seus preparos.
 * Ingrediente que falta pode ser sugerido.
 */
export function ItemPicker({
  visible,
  onClose,
  onPickIngredient,
  onPickRecipe,
  allowPreps,
  allowedPreps,
}: {
  visible: boolean;
  onClose: () => void;
  onPickIngredient: (ingredient: Ingredient) => void;
  onPickRecipe: (recipe: Recipe) => void;
  /** Receitas podem usar preparos; preparos levam só ingredientes (sem a aba de preparos). */
  allowPreps: boolean;
  /** Preparos disponíveis (sem os já adicionados). */
  allowedPreps: Recipe[];
}) {
  const { catalog } = useData();
  const [selectedTab, setTab] = useState<Tab>('ingredients');
  const tab: Tab = allowPreps ? selectedTab : 'ingredients';
  const [query, setQuery] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  const q = normalizeSearch(query);
  const ingredients = useMemo(() => catalog.filter((i) => !q || normalizeSearch(i.name).includes(q)), [catalog, q]);
  const preps = useMemo(() => allowedPreps.filter((r) => !q || normalizeSearch(r.name).includes(q)), [allowedPreps, q]);
  const exactMatch = ingredients.some((i) => normalizeSearch(i.name) === q);

  const close = () => {
    setQuery('');
    setSuggesting(false);
    onClose();
  };

  return (
    <ModalScreen visible={visible} title={allowPreps ? 'Adicionar à receita' : 'Adicionar ingrediente'} onClose={close}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {allowPreps && (
          <Segmented<Tab>
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSuggesting(false);
            }}
            options={[
              { value: 'ingredients', label: 'Ingredientes' },
              { value: 'preps', label: KIND.PREP.plural, icon: KIND.PREP.icon },
            ]}
          />
        )}
        <SearchBar value={query} onChangeText={setQuery} placeholder={tab === 'ingredients' ? 'Buscar ingrediente...' : 'Buscar preparo...'} />
        {tab === 'preps' && (
          <Text style={styles.muted}>
            Use um preparo seu como parte desta receita (ex.: molho de tomate na lasanha). Na lista de compras, ele aparece como um grupo separado.
          </Text>
        )}
        {tab === 'ingredients' && suggesting && (
          <SuggestionForm
            initialName={query.trim()}
            onCancel={() => setSuggesting(false)}
            onSent={() => {
              setSuggesting(false);
              setQuery('');
            }}
          />
        )}
        {tab === 'ingredients' && !suggesting && q.length > 1 && !exactMatch && (
          <Button title={`Não encontrou? Sugerir "${query.trim()}"`} icon="bulb-outline" variant="ghost" onPress={() => setSuggesting(true)} />
        )}
      </View>

      {suggesting ? null : tab === 'ingredients' ? (
        <FlatList
          data={ingredients}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <Row
              onPress={() => {
                setQuery('');
                onPickIngredient(item);
              }}
            >
              <Text style={[styles.body, { flex: 1 }]}>{item.name}</Text>
              {item.unit && <Text style={styles.muted}>{item.unit}</Text>}
            </Row>
          )}
          ListEmptyComponent={<Empty text="Nenhum ingrediente do catálogo com esse nome. Você pode sugerir que ele seja incluído." />}
        />
      ) : (
        <FlatList
          data={preps}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <Row
              onPress={() => {
                setQuery('');
                onPickRecipe(item);
              }}
            >
              <KindIcon kind="PREP" size={28} />
              <Text style={[styles.body, { flex: 1 }]}>{item.name}</Text>
            </Row>
          )}
          ListEmptyComponent={
            <Empty
              text={
                q
                  ? 'Nenhum preparo com esse nome.'
                  : 'Nenhum preparo disponível. Cadastre um preparo primeiro (no + do caderno, escolha Preparo). Ex.: arroz, molho de tomate.'
              }
            />
          }
        />
      )}
    </ModalScreen>
  );
}

/** Sugere um ingrediente para o catálogo (passa por aprovação). */
function SuggestionForm({ initialName, onCancel, onSent }: { initialName: string; onCancel: () => void; onSent: () => void }) {
  const { isGuest, suggestIngredient } = useData();
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const form = useFormValidation(suggestionSchema, { name, unit, note });

  if (isGuest) {
    return (
      <View style={[styles.card, { gap: spacing.sm }]}>
        <Text style={styles.body}>Entre na sua conta para sugerir ingredientes para o catálogo.</Text>
        <View style={styles.row}>
          <Button title="Agora não" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
          <Button title="Entrar" icon="log-in-outline" onPress={() => router.push('/account')} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  const send = async () => {
    const result = form.check();
    if (!result.ok) return;
    setSending(true);
    const ok = await suggestIngredient(result.value.name, result.value.unit ?? null, result.value.note || null);
    setSending(false);
    if (!ok) return;
    toast.success('Sugestão enviada', `Assim que "${result.value.name}" for aprovado, ele aparece no catálogo.`);
    onSent();
  };

  return (
    <View style={[styles.card, { gap: spacing.md }]}>
      <Text style={styles.subtitle}>Sugerir ingrediente</Text>
      <Text style={styles.muted}>As receitas usam só ingredientes do catálogo. Sua sugestão será analisada antes de entrar.</Text>
      <Field label="Nome *" error={form.errors.name}>
        <Input value={name} onChangeText={setName} placeholder="Ex.: Tahine" invalid={!!form.errors.name} maxLength={60} />
      </Field>
      <Field label="Unidade mais comum">
        <ChipSelect options={UNITS} value={unit} onChange={setUnit} />
      </Field>
      <Field label="Observação" error={form.errors.note}>
        <Input value={note} onChangeText={setNote} placeholder="Opcional (ex.: marca, onde encontrar)" invalid={!!form.errors.note} maxLength={300} />
      </Field>
      <View style={styles.row}>
        <Button title="Cancelar" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button title="Enviar sugestão" icon="send" loading={sending} onPress={send} style={{ flex: 1 }} />
      </View>
    </View>
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
