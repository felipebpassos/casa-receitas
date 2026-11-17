import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { useData } from '@/context/DataProvider';
import { parseRichText } from '@/lib/richText';
import { formatQuantity } from '@/lib/shopping';
import { PLATFORM_ICON, PLATFORM_LABEL, platformOf } from '@/lib/source';
import type { Recipe } from '@/lib/types';
import { KIND, KindIcon } from './RecipeKind';
import { RichText } from './RichText';
import { colors, fonts, spacing } from './theme';
import { styles } from './ui';

/** Prévia (somente leitura) de uma receita antes de cadastrar. */
export function RecipePreview({ recipe, subRecipeName }: { recipe: Recipe; subRecipeName: (id: string) => string }) {
  const data = useData();
  const ingredients = recipe.items.filter((i) => !i.subRecipeId);
  const subItems = recipe.items.filter((i) => i.subRecipeId);
  const hasPreparation = parseRichText(recipe.preparation).length > 0;
  const platform = recipe.sourceUrl ? platformOf(recipe.sourcePlatform) : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <KindIcon kind={recipe.kind} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={local.name}>{recipe.name}</Text>
          <Text style={styles.muted}>{KIND[recipe.kind].label}</Text>
        </View>
      </View>
      {recipe.description ? <Text style={styles.body}>{recipe.description}</Text> : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.subtitle}>Ingredientes</Text>
        <View style={[styles.card, { padding: 0 }]}>
          {ingredients.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 && <View style={[styles.separator, { marginLeft: spacing.md }]} />}
              <View style={[styles.row, local.line]}>
                <View style={local.dot} />
                <Text style={[styles.body, { flex: 1 }]}>{data.ingredientName(item.ingredientId!)}</Text>
                <Text style={local.qty}>{formatQuantity(item.quantity, item.unit)}</Text>
              </View>
            </View>
          ))}
          {subItems.map((item, idx) => (
            <View key={item.id}>
              {(ingredients.length > 0 || idx > 0) && <View style={styles.separator} />}
              <View style={[styles.row, local.line, { gap: spacing.md }]}>
                <KindIcon kind="PREP" size={32} />
                <Text style={[styles.body, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                  {subRecipeName(item.subRecipeId!)}
                </Text>
                <Text style={local.qty}>{formatQuantity(item.quantity, item.unit)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {hasPreparation && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.subtitle}>Modo de preparo</Text>
          <View style={styles.card}>
            <RichText value={recipe.preparation} />
          </View>
        </View>
      )}

      {platform && (
        <View style={[styles.row, { gap: spacing.xs }]}>
          <Ionicons name={PLATFORM_ICON[platform]} size={16} color={colors.muted} />
          <Text style={styles.muted}>Receita original: {PLATFORM_LABEL[platform]}</Text>
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  name: { fontSize: 21, fontFamily: fonts.serifSemiBold, color: colors.text },
  line: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  qty: { fontSize: 14, color: colors.muted, fontWeight: '600' },
});
