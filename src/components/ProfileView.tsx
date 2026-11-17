import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, IconButton, styles as ui } from '@/components/ui';
import { UsernameDialog } from '@/components/UsernameDialog';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Letra do avatar: a primeira letra do usuário. */
export function initials(name: string) {
  return (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
}

/** Perfil da pessoa logada: identidade, números do caderno, atalhos e sair. */
export function ProfileView({ onSignedOut }: { onSignedOut?: () => void }) {
  const { session, email, username, signOut } = useAuth();
  const { recipes } = useData();
  const [editingUsername, setEditingUsername] = useState(false);
  const user = session?.user;

  const name = username ?? '';
  const avatarUrl = (user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  const stats = useMemo(
    () => ({
      total: recipes.length,
      published: recipes.filter((r) => r.visibility === 'PUBLIC' && !r.originRecipeId).length,
    }),
    [recipes],
  );

  const openPublicProfile = () => user && router.push({ pathname: '/user/[id]', params: { id: user.id } });

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

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Identidade */}
      <View style={s.hero}>
        <View style={s.avatarRing}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarText}>{initials(name)}</Text>
            </View>
          )}
        </View>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          {username && <IconButton name="create-outline" label="Editar nome de usuário" size={20} color={colors.primary} onPress={() => setEditingUsername(true)} />}
        </View>
        <Text style={ui.muted} numberOfLines={1}>
          {email}
        </Text>
      </View>

      {/* Números */}
      <View style={s.stats}>
        <Stat icon="book-outline" value={stats.total} label={'salvas'} onPress={() => router.navigate('/')} />
        <Stat icon="globe-outline" value={stats.published} label={stats.published === 1 ? 'publicada' : 'publicadas'} onPress={openPublicProfile} />
      </View>

      {/* Atalhos */}
      <View>
        <Text style={[ui.label, s.sectionLabel]}>Atalhos</Text>
        <View style={s.menu}>
          <MenuRow icon="add-circle-outline" title="Nova receita" subtitle="Anote uma receita no seu caderno" onPress={() => router.navigate({ pathname: '/', params: { tab: 'new' } })} />
          <MenuRow icon="book-outline" title="Minhas receitas" subtitle="As receitas e preparos que você criou" onPress={() => router.navigate({ pathname: '/', params: { tab: 'mine' } })} />
          <MenuRow icon="bookmark-outline" title="Receitas salvas" subtitle="As que você salvou de outras pessoas" onPress={() => router.navigate({ pathname: '/', params: { tab: 'saved' } })} />
          <MenuRow icon="compass-outline" title="Explorar" subtitle="Veja o que outras pessoas publicaram" onPress={() => router.navigate('/explorar')} />
          <MenuRow icon="cart-outline" title="Semana e lista de compras" subtitle="Planeje as refeições" onPress={() => router.navigate('/semana')} last />
        </View>
      </View>

      <Button title="Sair da conta" icon="log-out-outline" variant="dangerGhost" onPress={askSignOut} />

      <Text style={[ui.muted, { textAlign: 'center' }]}>
        {memberSince ? `Conta criada em ${memberSince} · ` : ''}Versão {Constants.expoConfig?.version ?? '—'}
      </Text>

      {editingUsername && username && <UsernameDialog initial={username} onCancel={() => setEditingUsername(false)} />}
    </ScrollView>
  );
}

function Stat({ icon, value, label, onPress }: { icon: IconName; value: number; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.stat, pressed && { opacity: 0.7 }]} accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  container: { padding: spacing.xl, gap: spacing.xl },
  hero: { alignItems: 'center', gap: 2 },
  avatarRing: { padding: 4, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.primaryLight, marginBottom: spacing.sm },
  avatar: { width: 88, height: 88, borderRadius: radius.pill },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 32, color: colors.onPrimary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  name: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text, flexShrink: 1 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningLight, borderColor: colors.warningLight },
  sectionLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
});
