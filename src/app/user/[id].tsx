import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from '@/components/ErrorState';
import { initials } from '@/components/ProfileView';
import { RecipeListItem } from '@/components/RecipeListItem';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, EmptyState, Loading, styles } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { follow, getFollowStats, unfollow, type FollowStats } from '@/lib/follows';
import { haptic } from '@/lib/haptics';
import { getPublicProfile, type PublicProfile } from '@/lib/publicLibrary';

/** Laranja da marca escurecendo para baixo (capa do perfil). */
const HERO_GRADIENT = 'linear-gradient(180deg, #D97A52 0%, #C8603A 55%, #A84D2D 100%)';
/** Continuação suave da capa sobre o fundo, atrás do botão Seguir. */
const BAND_GRADIENT = 'linear-gradient(180deg, rgba(168, 77, 45, 0.16) 0%, rgba(249, 245, 234, 0) 100%)';

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
    ].filter(Boolean);

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
            {/* Capa */}
            <View style={[s.hero, { paddingTop: insets.top + 56 }]}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(name)}</Text>
              </View>
              <View style={s.heroText}>
                <Text style={s.kicker}>Perfil</Text>
                <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {name}
                </Text>
                <Text style={s.facts}>{facts.join('  •  ')}</Text>
              </View>
            </View>

            {/* Ações */}
            <View style={s.band}>
              {isMe ? (
                <Text style={styles.muted}>É assim que outras pessoas veem o seu perfil.</Text>
              ) : (
                (stats || !userId) && <FollowButton following={!!stats?.isFollowing} busy={toggling} onPress={toggleFollow} />
              )}
            </View>

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
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: following, busy }}
      accessibilityLabel={following ? 'Seguindo. Toque para deixar de seguir' : 'Seguir'}
      style={({ pressed }) => [s.follow, following && s.following, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <>
          {following && <Ionicons name="checkmark" size={16} color={colors.text} />}
          <Text style={s.followText}>{following ? 'Seguindo' : 'Seguir'}</Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.primary,
    backgroundImage: HERO_GRADIENT,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(61, 52, 46, 0.35)',
  },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 44, color: colors.primary },
  heroText: { flex: 1, gap: 2, paddingBottom: spacing.xs },
  kicker: { fontSize: 13, fontWeight: '600', color: colors.onPrimary, opacity: 0.9 },
  name: { fontFamily: fonts.serifBold, fontSize: 34, lineHeight: 42, color: colors.onPrimary },
  facts: { fontSize: 13, fontWeight: '500', color: colors.onPrimary, opacity: 0.85 },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundImage: BAND_GRADIENT,
  },
  follow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 104,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  following: { backgroundColor: colors.surface, borderColor: colors.border },
  followText: { fontSize: 14, fontWeight: '700', color: colors.text },
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
