import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ErrorView } from '@/components/ErrorState';
import { initials } from '@/components/ProfileView';
import { RecipeListItem } from '@/components/RecipeListItem';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { Button, EmptyState, Loading, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { getPublicProfile, type PublicProfile } from '@/lib/publicLibrary';

/** Perfil público: as receitas e preparos que a pessoa deixou públicos. */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicProfile(id)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const retry = () => {
    setRefreshing(true);
    setTick((t) => t + 1);
  };

  const name = profile?.name ?? 'Usuário';
  const isMe = !!userId && userId === id;

  let content;
  if (error && !profile) {
    content = (
      <ErrorView
        error={error}
        context={{ title: 'Não foi possível abrir o perfil' }}
        retrying={refreshing}
        onRetry={retry}
        actions={router.canGoBack() ? <Button title="Voltar" variant="ghost" onPress={() => router.back()} /> : null}
      />
    );
  } else if (profile === undefined) {
    content = <Loading />;
  } else if (profile === null) {
    content = <EmptyState icon="person-outline" title="Perfil não encontrado" subtitle="A conta pode ter sido excluída." />;
  } else {
    const count = profile.recipes.length;
    content = (
      <FlatList
        data={profile.recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[colors.primary]} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={s.hero}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(name)}</Text>
            </View>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.muted}>
              {count} {count === 1 ? 'publicação' : 'publicações'}
            </Text>
            {isMe && <Text style={[styles.muted, { textAlign: 'center' }]}>É assim que outras pessoas veem o seu perfil.</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <RecipeListItem id={item.id} kind={item.kind} name={item.name} itemCount={item.itemCount} author={item.authorName} showAuthor={false} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="lock-closed-outline"
            title="Nenhuma receita pública"
            subtitle={isMe ? 'Ao cadastrar ou editar, ative "Publicar" para que ela apareça aqui.' : undefined}
          />
        }
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: profile ? name : 'Perfil', headerTitleAlign: 'left' }} />
      <View style={styles.separator} />
      <View style={styles.screen}>{content}</View>
    </>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2, paddingBottom: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.onPrimary },
  name: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text, maxWidth: '100%' },
});
