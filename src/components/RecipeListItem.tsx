import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KIND, KindIcon } from '@/components/RecipeKind';
import { colors, spacing } from '@/components/theme';
import { styles } from '@/components/ui';
import type { RecipeKind } from '@/lib/types';

/**
 * Card de receita/preparo das listas. `author` nulo = sua ("Minha").
 * `showAuthor = false` esconde a autoria (ex.: no perfil de quem criou).
 */
export function RecipeListItem({
  id,
  kind,
  name,
  itemCount,
  author,
  showAuthor = true,
}: {
  id: string;
  kind: RecipeKind;
  name: string;
  itemCount: number;
  author: string | null;
  showAuthor?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id } })}
      accessibilityRole="link"
      accessibilityLabel={`${KIND[kind].label}: ${name}${showAuthor && author ? `, por ${author}` : ''}`}
      style={({ pressed }) => [styles.card, styles.row, { gap: spacing.md }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <KindIcon kind={kind} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        {/* Título com a linha toda para ele (até 2 linhas). A visibilidade fica só na tela da receita. */}
        <Text style={[styles.subtitle, { fontSize: 16, lineHeight: 21 }]} numberOfLines={2}>
          {name}
        </Text>
        <View style={[styles.row, { gap: spacing.md }]}>
          <Meta icon="cart-outline" text={`${itemCount} ingrediente${itemCount === 1 ? '' : 's'}`} />
          {showAuthor && <Meta icon="person-outline" text={author ? `por ${author}` : 'Minha'} shrink />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function Meta({ icon, text, shrink }: { icon: ComponentProps<typeof Ionicons>['name']; text: string; shrink?: boolean }) {
  return (
    <View style={[styles.row, { gap: 4 }, shrink && { flexShrink: 1 }]}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={[styles.muted, shrink && { flexShrink: 1 }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
