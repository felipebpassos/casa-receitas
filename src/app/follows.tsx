import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ErrorView } from '@/components/ErrorState';
import { PersonListItem } from '@/components/PersonListItem';
import { colors, spacing } from '@/components/theme';
import { Button, EmptyState, Loading, Segmented, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { listMyFollows, type FollowListKind } from '@/lib/follows';
import type { PublicPersonSummary } from '@/lib/publicLibrary';

const EMPTY: Record<FollowListKind, { title: string; subtitle: string }> = {
  followers: { title: 'Ninguém segue você ainda', subtitle: 'Publique receitas e compartilhe seu nome de usuário com os amigos.' },
  following: { title: 'Você ainda não segue ninguém', subtitle: 'Encontre amigos em Explorar › Usuários.' },
};

/** Quem segue a pessoa logada e quem ela segue (só ela vê). */
export default function FollowsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { userId } = useAuth();
  const [tab, setTab] = useState<FollowListKind>(params.tab === 'following' ? 'following' : 'followers');
  const [lists, setLists] = useState<Partial<Record<FollowListKind, PublicPersonSummary[]>>>({});
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [followers, following] = await Promise.all([listMyFollows('followers'), listMyFollows('following')]);
      setLists({ followers, following });
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Recarrega ao voltar de um perfil (pode ter seguido ou deixado de seguir).
  useFocusEffect(
    useCallback(() => {
      if (userId) load();
    }, [userId, load]),
  );

  const retry = () => {
    setRefreshing(true);
    load();
  };

  const data = lists[tab];
  const count = (k: FollowListKind) => (lists[k] ? ` (${lists[k].length})` : '');

  let content;
  if (!userId) {
    content = (
      <View style={styles.empty}>
        <EmptyState icon="people-outline" title="Entre na sua conta" subtitle="Para seguir pessoas e ver quem segue você." />
        <Button title="Entrar" icon="log-in-outline" onPress={() => router.push('/account')} />
      </View>
    );
  } else if (error && !data) {
    content = <ErrorView error={error} context={{ title: 'Não foi possível carregar' }} onRetry={retry} retrying={refreshing} />;
  } else if (!data) {
    content = <Loading />;
  } else {
    content = (
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[colors.primary]} tintColor={colors.primary} />}
        renderItem={({ item }) => <PersonListItem person={item} />}
        ListEmptyComponent={<EmptyState icon="people-outline" title={EMPTY[tab].title} subtitle={EMPTY[tab].subtitle} />}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Conexões', headerTitleAlign: 'left' }} />
      <View style={styles.separator} />
      <View style={styles.screen}>
        {userId && (
          <View style={{ padding: spacing.lg }}>
            <Segmented<FollowListKind>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'followers', label: `Seguidores${count('followers')}` },
                { value: 'following', label: `Seguindo${count('following')}` },
              ]}
            />
          </View>
        )}
        {content}
      </View>
    </>
  );
}
