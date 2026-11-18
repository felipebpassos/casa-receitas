import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { ProfileHero } from '@/components/ProfileHero';
import { colors, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, IconButton, styles as ui } from '@/components/ui';
import { UsernameDialog } from '@/components/UsernameDialog';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';
import { getFollowStats, type FollowStats } from '@/lib/follows';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Perfil da pessoa logada: capa com nome e números, atalhos e sair.
 * `topInset`: a capa vai até o topo da tela (aba Perfil) e deixa esse espaço para a barra de status.
 */
export function ProfileView({ onSignedOut, topInset }: { onSignedOut?: () => void; topInset?: number }) {
  const { session, username, signOut } = useAuth();
  const { recipes } = useData();
  const [editingUsername, setEditingUsername] = useState(false);
  const user = session?.user;

  const name = username ?? '';
  const avatarUrl = (user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  const published = useMemo(() => recipes.filter((r) => r.visibility === 'PUBLIC' && !r.originRecipeId).length, [recipes]);

  // Seguidores/seguindo: recarrega ao voltar para a tela (pode ter seguido alguém).
  const [follows, setFollows] = useState<FollowStats | null>(null);
  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      getFollowStats(userId)
        .then((st) => !cancelled && setFollows(st))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  const openPublicProfile = () => user && router.push({ pathname: '/user/[id]', params: { id: user.id } });
  const openFollows = (tab: 'followers' | 'following') => router.push({ pathname: '/follows', params: { tab } });
  const followers = follows?.followers ?? 0;
  const following = follows?.following ?? 0;

  const askSignOut = () =>
    confirm({
      title: 'Sair da conta',
      message: 'Seus dados continuam salvos na conta. Neste celular, o app volta a funcionar sem conta.',
      confirmText: 'Sair',
      destructive: true,
      icon: 'log-out-outline',
      onConfirm: async () => {
        await signOut();
        toast.success('Você saiu da conta', 'Neste celular, o app volta a funcionar sem conta.');
        onSignedOut?.();
      },
    });

  // Na aba, a capa vai até o topo: a barra de status fica clara sobre o laranja.
  const edgeToEdge = topInset != null;
  const isFocused = useIsFocused();

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {edgeToEdge && isFocused && <StatusBar style="light" />}

      {/* Capa (mesma do perfil público) */}
      <ProfileHero
        name={name}
        avatarUrl={avatarUrl}
        paddingTop={(topInset ?? 0) + spacing.xl}
        nameAccessory={
          username && <IconButton name="create-outline" label="Editar nome de usuário" size={22} color={colors.onPrimary} onPress={() => setEditingUsername(true)} />
        }
        facts={[
          { label: `${published} ${published === 1 ? 'publicação' : 'publicações'}`, onPress: openPublicProfile },
          { label: `${followers} ${followers === 1 ? 'seguidor' : 'seguidores'}`, onPress: () => openFollows('followers') },
          { label: `${following} seguindo`, onPress: () => openFollows('following') },
        ]}
      />

      <View style={s.body}>
      {/* Atalhos */}
      <View>
        <Text style={[ui.label, s.sectionLabel]}>Atalhos</Text>
        <View style={s.menu}>
          <MenuRow icon="add-circle-outline" title="Nova receita" subtitle="Anote uma receita no seu caderno" onPress={() => router.navigate({ pathname: '/', params: { tab: 'new' } })} />
          <MenuRow icon="book-outline" title="Minhas receitas" subtitle="As que você criou e as que salvou" onPress={() => router.navigate('/')} />
          <MenuRow icon="compass-outline" title="Explorar" subtitle="Veja o que outras pessoas publicaram" onPress={() => router.navigate('/explorar')} />
          <MenuRow icon="cart-outline" title="Semana e lista de compras" subtitle="Planeje as refeições" onPress={() => router.navigate('/semana')} last />
        </View>
      </View>

      <Button title="Sair da conta" icon="log-out-outline" variant="dangerGhost" onPress={askSignOut} />

      <Text style={[ui.muted, { textAlign: 'center' }]}>
        {memberSince ? `Conta criada em ${memberSince} · ` : ''}Versão {Constants.expoConfig?.version ?? '—'}
      </Text>
      </View>

      {editingUsername && username && <UsernameDialog initial={username} onCancel={() => setEditingUsername(false)} />}
    </ScrollView>
  );
}

function MenuRow({ icon, title, subtitle, onPress, last }: { icon: IconName; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.menuRow, !last && s.menuDivider, pressed && { backgroundColor: colors.surface }]}>
      <View style={s.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuTitle}>{title}</Text>
        <Text style={ui.muted}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl },
  sectionLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
});
