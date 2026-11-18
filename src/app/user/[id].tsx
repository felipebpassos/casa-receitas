import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from '@/components/ErrorState';
import { PillButton, pillTextStyle, ProfileBand, ProfileHero } from '@/components/ProfileHero';
import { RecipeListItem } from '@/components/RecipeListItem';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, EmptyState, Loading, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { follow, getFollowStats, unfollow, type FollowStats } from '@/lib/follows';
import { haptic } from '@/lib/haptics';
import { getPublicProfile, type PublicProfile } from '@/lib/publicLibrary';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/explorar'));

/** Perfil público: capa com nome e números, botão Seguir e as receitas e preparos públicos. */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState<FollowStats | null>(null);
  const [toggling, setToggling] = useState(false);

  // Seguidores: não impedem abrir o perfil (se falharem, só não aparecem). Recarrega ao entrar/sair da conta.
  useEffect(() => {
    let cancelled = false;
    getFollowStats(id)
      .then((st) => !cancelled && setStats(st))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, tick, userId]);

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

  const toggleFollow = async () => {
    if (!userId) {
      router.push('/account');
      return;
    }
    if (!stats || toggling) return;
    const wasFollowing = stats.isFollowing;
    // Otimista: muda na hora e desfaz se der erro.
    const apply = (following: boolean) =>
      setStats((st) => st && { ...st, isFollowing: following, followers: Math.max(0, st.followers + (following === st.isFollowing ? 0 : following ? 1 : -1)) });
    apply(!wasFollowing);
    setToggling(true);
    try {
      await (wasFollowing ? unfollow(userId, id) : follow(userId, id));
      haptic.tap();
    } catch (e) {
      apply(wasFollowing);
      toast.error(e, { title: wasFollowing ? 'Não foi possível deixar de seguir' : 'Não foi possível seguir' });
    } finally {
      setToggling(false);
    }
  };

  let content;
  if (error && !profile) {
    content = (
      <ErrorView
        error={error}
        context={{ title: 'Não foi possível abrir o perfil' }}
        retrying={refreshing}
        onRetry={retry}
        actions={<Button title="Voltar" variant="ghost" onPress={goBack} />}
      />
    );
  } else if (profile === undefined) {
    content = <Loading />;
  } else if (profile === null) {
    content = <EmptyState icon="person-outline" title="Perfil não encontrado" subtitle="A conta pode ter sido excluída." />;
  } else {
    const count = profile.recipes.length;
    // Como no Spotify: publicações • seguidores (• seguindo, só no próprio perfil).
    const facts = [
      `${count} ${count === 1 ? 'publicação' : 'publicações'}`,
      stats && `${stats.followers} ${stats.followers === 1 ? 'seguidor' : 'seguidores'}`,
      stats?.following != null && `${stats.following} seguindo`,
    ]
      .filter((f): f is string => !!f)
      .map((label) => ({ label }));

    content = (
      <FlatList
        data={profile.recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={retry} colors={[colors.primary]} tintColor={colors.onPrimary} progressViewOffset={insets.top} />
        }
        ListHeaderComponent={
          <>
            <ProfileHero name={name} facts={facts} paddingTop={insets.top + 56} />

            {/* Ações */}
            <ProfileBand>
              {isMe ? (
                <Text style={styles.muted}>É assim que outras pessoas veem o seu perfil.</Text>
              ) : (
                (stats || !userId) && <FollowButton following={!!stats?.isFollowing} busy={toggling} onPress={toggleFollow} />
              )}
            </ProfileBand>

            {count > 0 && <Text style={s.sectionTitle}>Receitas publicadas</Text>}
          </>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <RecipeListItem id={item.id} kind={item.kind} name={item.name} itemCount={item.itemCount} author={item.authorName} showAuthor={false} />
          </View>
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

  // Sem capa (carregando, erro), a barra de status fica escura sobre o fundo claro.
  const onHero = !!profile;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: profile ? name : 'Perfil' }} />
      {onHero && <StatusBar style="light" />}
      <View style={styles.screen}>
        {content}
        <Pressable
          onPress={goBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={({ pressed }) => [s.back, { top: insets.top + spacing.sm }, !onHero && s.backOnLight, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={22} color={onHero ? colors.onPrimary : colors.text} />
        </Pressable>
      </View>
    </>
  );
}

/** Botão em pílula com contorno; "Seguindo" fica preenchido de leve. */
function FollowButton({ following, busy, onPress }: { following: boolean; busy: boolean; onPress: () => void }) {
  return (
    <PillButton
      onPress={onPress}
      disabled={busy}
      filled={following}
      accessibilityState={{ selected: following, busy }}
      accessibilityLabel={following ? 'Seguindo. Toque para deixar de seguir' : 'Seguir'}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <>
          {following && <Ionicons name="checkmark" size={16} color={colors.text} />}
          <Text style={pillTextStyle}>{following ? 'Seguindo' : 'Seguir'}</Text>
        </>
      )}
    </PillButton>
  );
}

const s = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.serifSemiBold, fontSize: 18, color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(61, 52, 46, 0.28)',
  },
  backOnLight: { backgroundColor: colors.surface },
});
