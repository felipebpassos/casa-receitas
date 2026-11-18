import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { initials } from '@/components/ProfileHero';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { styles } from '@/components/ui';
import type { PublicPersonSummary } from '@/lib/publicLibrary';

/** Linha de pessoa nos resultados de busca: abre o perfil público. */
export function PersonListItem({ person }: { person: PublicPersonSummary }) {
  const name = person.name ?? 'Usuário';
  const count = `${person.recipeCount} ${person.recipeCount === 1 ? 'publicação' : 'publicações'}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: person.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${count}`}
      style={({ pressed }) => [styles.card, styles.row, { gap: spacing.md }, pressed && { backgroundColor: colors.primaryLight }]}
    >
      <View style={s.avatar}>
        <Text style={s.avatarText}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.subtitle, { fontSize: 16, lineHeight: 21 }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.muted}>{count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 15, color: colors.onPrimary },
});
