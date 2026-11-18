import { Fragment, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/components/theme';

/** Laranja da marca escurecendo para baixo (capa do perfil). */
const HERO_GRADIENT = 'linear-gradient(180deg, #D97A52 0%, #C8603A 55%, #A84D2D 100%)';
/** Continuação suave da capa sobre o fundo, logo abaixo dela. */
const BAND_GRADIENT = 'linear-gradient(180deg, rgba(168, 77, 45, 0.16) 0%, rgba(249, 245, 234, 0) 100%)';

/** Letra do avatar: a primeira letra do usuário. */
export function initials(name: string) {
  return (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
}

export type ProfileFact = { label: string; onPress?: () => void };

/**
 * Capa do perfil (usada no perfil público e na aba Perfil): avatar, "Perfil", nome e números.
 * `paddingTop` deixa espaço para a barra de status / botão voltar quando a capa vai até o topo.
 */
export function ProfileHero({
  name,
  avatarUrl,
  facts,
  nameAccessory,
  paddingTop,
}: {
  name: string;
  avatarUrl?: string;
  facts: ProfileFact[];
  nameAccessory?: ReactNode;
  paddingTop: number;
}) {
  return (
    <View style={[s.hero, { paddingTop }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={s.avatar} accessibilityIgnoresInvertColors />
      ) : (
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(name)}</Text>
        </View>
      )}
      <View style={s.heroText}>
        <Text style={s.kicker}>Perfil</Text>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {name}
          </Text>
          {nameAccessory}
        </View>
        <Text style={s.facts}>
          {facts.map((f, i) => (
            <Fragment key={f.label}>
              {i > 0 && '  •  '}
              {f.onPress ? (
                <Text onPress={f.onPress} accessibilityRole="link" suppressHighlighting={false}>
                  {f.label}
                </Text>
              ) : (
                f.label
              )}
            </Fragment>
          ))}
        </Text>
      </View>
    </View>
  );
}

/** Faixa logo abaixo da capa, onde ficam as ações (Seguir, Ver perfil público…). */
export function ProfileBand({ children }: { children: ReactNode }) {
  return <View style={s.band}>{children}</View>;
}

/** Botão em pílula com contorno, usado na faixa abaixo da capa. */
export function PillButton({
  children,
  onPress,
  disabled,
  filled,
  accessibilityLabel,
  accessibilityState,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; busy?: boolean };
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [s.pill, filled && s.pillFilled, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

export const pillTextStyle = { fontSize: 14, fontWeight: '700', color: colors.text } as const;

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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28, color: colors.onPrimary, flexShrink: 1 },
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
  pill: {
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
  pillFilled: { backgroundColor: colors.surface, borderColor: colors.border },
});
