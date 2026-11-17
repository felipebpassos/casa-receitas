import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorView } from '@/components/ErrorState';
import { initials } from '@/components/ProfileView';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { Button, EmptyState, Loading, SearchBar, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { searchPublicProfiles, type PublicPersonSummary } from '@/lib/publicLibrary';

/**
 * Buscar amigos: a pessoa digita o nome de usuário exato e toca em Pesquisar.
 * Nada aparece antes da primeira pesquisa (não é uma lista de todo mundo).
 */
export default function PeopleSearchScreen() {
  const { userId } = useAuth();
  const [text, setText] = useState('');
  // undefined = ainda não pesquisou.
  const [results, setResults] = useState<PublicPersonSummary[] | undefined>(undefined);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(0);

  const term = text.trim();

  const search = async () => {
    if (!term) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await searchPublicProfiles(term, userId);
      if (id !== requestId.current) return;
      setResults(data);
      setSearched(term);
    } catch (e) {
      if (id === requestId.current) setError(e);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  let content;
  if (loading) content = <Loading />;
  else if (error) content = <ErrorView error={error} context={{ title: 'Não foi possível buscar' }} onRetry={search} />;
  else if (results === undefined)
    content = <EmptyState icon="people-outline" title="Encontre seus amigos" subtitle="Digite o nome de usuário exato de quem você procura (ex.: maria.silva) e toque em Pesquisar." />;
  else
    content = (
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <PersonListItem person={item} />}
        ListEmptyComponent={<EmptyState icon="search" title="Ninguém encontrado" subtitle={`Ninguém com o usuário "${searched.replace(/^@+/, '')}". Confira se digitou o nome exato.`} />}
      />
    );

  return (
    <View style={styles.screen}>
      <View style={styles.separator} />
      <View style={[styles.row, { gap: spacing.sm, padding: spacing.lg }]}>
        <SearchBar value={text} onChangeText={setText} onSubmit={search} placeholder="Nome de usuário" autoCapitalize="none" autoFocus style={{ flex: 1 }} />
        <Button title="Pesquisar" onPress={search} disabled={!term} loading={loading} style={{ borderRadius: radius.pill, paddingVertical: 10 }} />
      </View>
      {content}
    </View>
  );
}

function PersonListItem({ person }: { person: PublicPersonSummary }) {
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
