import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from './theme';
import { Button } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type WelcomeAction = { title: string; icon?: IconName; onPress: () => void };

const useNativeDriver = Platform.OS !== 'web';

/** Tela intermediária depois de criar a conta: celebra e sugere o próximo passo. */
export function WelcomeModal({
  name,
  primary,
  secondary,
}: {
  name: string;
  primary: WelcomeAction;
  secondary?: WelcomeAction;
}) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 7, tension: 80 }).start();
  }, [anim]);

  const firstName = name.trim().split(/\s+/)[0];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={primary.onPress} statusBarTranslucent>
      <View style={s.backdrop}>
        <Animated.View
          accessibilityViewIsModal
          style={[s.card, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
        >
          <View style={s.badgeOuter}>
            <View style={s.badgeInner}>
              <Ionicons name="checkmark" size={40} color={colors.onPrimary} />
            </View>
          </View>

          <Text style={s.title}>Conta criada!</Text>
          <Text style={s.subtitle}>Boas-vindas, {firstName}.</Text>

          <View style={s.perks}>
            <Perk icon="book-outline" text="Monte seu caderno de receitas" />
            <Perk icon="globe-outline" text="Publique receitas para outras pessoas" />
            <Perk icon="cart-outline" text="Gere a lista de compras da semana" />
          </View>

          <View style={s.actions}>
            <Button title={primary.title} icon={primary.icon} onPress={primary.onPress} />
            {secondary && <Button title={secondary.title} icon={secondary.icon} variant="ghost" onPress={secondary.onPress} />}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Perk({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.perk}>
      <View style={s.perkIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={s.perkText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,52,46,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: '#3D342E',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  badgeOuter: { padding: 8, borderRadius: radius.pill, backgroundColor: colors.successLight, marginBottom: spacing.md },
  badgeInner: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.text, textAlign: 'center' },
  subtitle: { fontFamily: fonts.serifMedium, fontSize: 17, color: colors.primary, textAlign: 'center' },
  perks: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: radius.md },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  perkIcon: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, fontSize: 14, color: colors.text },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.lg },
});
