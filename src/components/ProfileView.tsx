import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/components/ConfirmDialog';
import { colors, fonts, radius, spacing } from '@/components/theme';
import { toast } from '@/components/Toast';
import { Button, styles as ui } from '@/components/ui';
import { useAuth } from '@/context/AuthProvider';
import { useData } from '@/context/DataProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Nome de exibição: o do cadastro, o do Google ou o começo do e-mail. */
export function userDisplayName(meta: Record<string, unknown> | undefined, email: string | null) {
  const pick = (k: string) => (typeof meta?.[k] === 'string' && (meta[k] as string).trim()) || null;
  return pick('display_name') ?? pick('full_name') ?? pick('name') ?? email?.split('@')[0] ?? 'Você';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Perfil da pessoa logada: identidade, números do caderno, atalhos e sair. */
export function ProfileView({ onSignedOut }: { onSignedOut?: () => void }) {
  const { session, email, signOut } = useAuth();
  const { recipes } = useData();
  const user = session?.user;

  const name = userDisplayName(user?.user_metadata, email);
  const avatarUrl = (user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  const stats = useMemo(
    () => ({
      total: recipes.length,
      published: recipes.filter((r) => r.status === 'APPROVED').length,
      pending: recipes.filter((r) => r.status === 'PENDING').length,
      rejected: recipes.filter((r) => r.status === 'REJECTED').length,
    }),
    [recipes],
  );

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
        <Text style={s.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={ui.muted} numberOfLines={1}>
          {email}
        </Text>
      </View>

      {/* Números */}
      <View style={s.stats}>
        <Stat icon="book-outline" value={stats.total} label={stats.total === 1 ? 'receita' : 'receitas'} onPress={() => router.navigate('/')} />
        <Stat icon="globe-outline" value={stats.published} label={stats.published === 1 ? 'publicada' : 'publicadas'}
          onPress={() => router.navigate({ pathname: '/', params: { tab: 'explore' } })}
        />
      </View>

      {/* Moderação: só aparece quando há algo acontecendo */}
      {(stats.pending > 0 || stats.rejected > 0) && (
        <View style={[ui.card, s.notice]}>
          <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
          <Text style={[ui.body, { flex: 1 }]}>
            {[
              stats.pending > 0 && `${stats.pending} ${stats.pending === 1 ? 'receita em análise' : 'receitas em análise'}`,
              stats.rejected > 0 && `${stats.rejected} ${stats.rejected === 1 ? 'recusada' : 'recusadas'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      )}

      {/* Atalhos */}
      <View>
        <Text style={[ui.label, s.sectionLabel]}>Atalhos</Text>
        <View style={s.menu}>
          <MenuRow icon="add-circle-outline" title="Nova receita" subtitle="Anote uma receita no seu caderno" onPress={() => router.push('/recipe/form')} />
          <MenuRow icon="book-outline" title="Meu caderno" subtitle="Suas receitas e as que você salvou" onPress={() => router.navigate('/')} />
          <MenuRow icon="compass-outline" title="Explorar receitas" subtitle="Veja o que outras pessoas publicaram" onPress={() => router.navigate({ pathname: '/', params: { tab: 'explore' } })} />
          <MenuRow icon="cart-outline" title="Semana e lista de compras" subtitle="Planeje as refeições" onPress={() => router.navigate('/semana')} last />
        </View>
      </View>

      <Button title="Sair da conta" icon="log-out-outline" variant="dangerGhost" onPress={askSignOut} />

      <Text style={[ui.muted, { textAlign: 'center' }]}>
        {memberSince ? `Conta criada em ${memberSince} · ` : ''}Versão {Constants.expoConfig?.version ?? '—'}
      </Text>
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
  name: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text, maxWidth: '100%' },
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
