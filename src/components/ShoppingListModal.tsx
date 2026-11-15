import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useFormValidation } from '@/hooks/useFormValidation';
import { useShoppingList } from '@/hooks/useShoppingList';
import { weekLabel } from '@/lib/dates';
import { countItems, formatQuantity, listCheckKey, shoppingListText, UNITS, type ListExtra, type NeedGroup } from '@/lib/shopping';
import { extraSchema, parseQuantity } from '@/lib/validation';
import { ModalScreen } from './ModalScreen';
import { NeedsList } from './NeedsList';
import { colors, spacing } from './theme';
import { Button, Checkbox, ChipSelect, FieldError, IconButton, Input, styles } from './ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  weekStart: string;
  /** Ingredientes do plano da semana, por receita/preparo. */
  groups: NeedGroup[];
};

/** Lista de compras da semana em tela cheia: riscar o que já tem (ou já pegou) e adicionar itens avulsos. */
export function ShoppingListModal({ visible, onClose, weekStart, groups }: Props) {
  const { list, setChecked, addExtra, toggleExtra, removeExtra, reset } = useShoppingList(weekStart);
  const checked = useMemo(() => new Set(list.checked), [list.checked]);
  const isChecked = (g: NeedGroup, i: NeedGroup['items'][number]) => checked.has(listCheckKey(g, i));

  const total = countItems(groups) + list.extras.length;
  const done = groups.reduce((n, g) => n + g.items.filter((i) => isChecked(g, i)).length, 0) + list.extras.filter((e) => e.checked).length;

  const title = `Lista de compras — semana de ${weekLabel(weekStart)}`;
  const shareText = shoppingListText(title, groups, list);
  const share = () => Share.share({ message: shareText }).catch(() => undefined);

  return (
    <ModalScreen
      visible={visible}
      title="Lista de compras"
      subtitle={`Semana de ${weekLabel(weekStart)}`}
      onClose={onClose}
      actions={
        <>
          {total > 0 && <Text style={[styles.muted, done === total && { color: colors.success, fontWeight: '700' }]}>{`${done}/${total}`}</Text>}
          <IconButton name="share-outline" label="Compartilhar lista" color={shareText ? colors.primary : colors.border} onPress={shareText ? share : () => undefined} />
        </>
      }
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>Risque o que você já tem em casa ou já pegou no mercado. Já tem um preparo pronto? Toque em “Riscar tudo” nele.</Text>
        <NeedsList
          groups={groups}
          isChecked={isChecked}
          onToggle={(g, i) => setChecked([listCheckKey(g, i)], !isChecked(g, i))}
          onToggleGroup={(g, value) => setChecked(g.items.map((i) => listCheckKey(g, i)), value)}
        />

        <Text style={[styles.label, { marginTop: spacing.sm }]}>Outros itens</Text>
        {list.extras.length > 0 && (
          <View style={[styles.card, { padding: 0 }]}>
            {list.extras.map((e, idx) => (
              <View key={e.id}>
                {idx > 0 && <View style={styles.separator} />}
                <ExtraRow extra={e} onToggle={() => toggleExtra(e.id)} onRemove={() => removeExtra(e.id)} />
              </View>
            ))}
          </View>
        )}
        <ExtraForm onAdd={addExtra} />

        {(done > 0 || list.extras.length > 0) && <ResetButton onReset={reset} />}
      </ScrollView>
    </ModalScreen>
  );
}

/** Pede um segundo toque em vez de um diálogo (diálogos não abrem por cima do modal em todas as plataformas). */
function ResetButton({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <Button
      title={armed ? 'Toque de novo para limpar tudo' : 'Recomeçar lista'}
      icon="refresh"
      variant={armed ? 'danger' : 'dangerGhost'}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onReset();
      }}
    />
  );
}

function ExtraRow({ extra, onToggle, onRemove }: { extra: ListExtra; onToggle: () => void; onRemove: () => void }) {
  const qty = formatQuantity(extra.quantity, extra.unit);
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: extra.checked }} style={[styles.row, { padding: spacing.md, gap: spacing.md }]}>
      <Checkbox checked={extra.checked} />
      <Text style={[styles.body, { flex: 1 }, extra.checked && { textDecorationLine: 'line-through', color: colors.muted }]}>
        {extra.name}
        {qty ? <Text style={{ fontWeight: '700' }}>{`  ${qty}`}</Text> : null}
      </Text>
      <IconButton name="close" label={`Remover ${extra.name}`} onPress={onRemove} />
    </Pressable>
  );
}

function ExtraForm({ onAdd }: { onAdd: (name: string, quantity: number | null, unit: string | null) => void }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string | null>(null);

  const form = useFormValidation(extraSchema, { name, quantity, unit });
  const { errors } = form;

  const submit = () => {
    const result = form.check();
    if (!result.ok) return;
    const q = parseQuantity(result.value.quantity);
    onAdd(result.value.name, q, q != null ? unit : null);
    setName('');
    setQuantity('');
    setUnit(null);
    form.reset();
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
