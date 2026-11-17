import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import type { RecipeKind } from '@/lib/types';
import { KIND } from './RecipeKind';
import { colors, fonts, spacing } from './theme';

const useNativeDriver = Platform.OS !== 'web';
const CONFETTI = 14;
const CONFETTI_COLORS = [colors.primary, colors.olive, '#E2A63B', colors.primaryLight, colors.oliveLight];

/** Comemoração ao cadastrar: check que "estoura", onda e confetes. Chama `onDone` no fim. */
export function SaveCelebration({ kind, title, subtitle, onDone }: { kind: RecipeKind; title: string; subtitle?: string; onDone: () => void }) {
  const k = KIND[kind];
  const [fade] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(0));
  // Direção e distância de cada confete, sorteadas uma vez.
  const [pieces] = useState(() =>
    Array.from({ length: CONFETTI }, (_, i) => {
      const angle = (i / CONFETTI) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 60;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size: 6 + Math.round(Math.random() * 5),
        round: i % 3 !== 0,
        rotate: `${Math.round(Math.random() * 360)}deg`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      };
    }),
  );

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver }),
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver }),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver }),
        Animated.timing(text, { toValue: 1, duration: 320, delay: 120, useNativeDriver }),
      ]),
      Animated.delay(650),
    ]).start(() => onDone());
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, { opacity: fade }]} accessibilityLiveRegion="polite">
      <View style={s.center}>
        {pieces.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              s.piece,
              {
                width: p.size,
                height: p.round ? p.size : p.size * 1.8,
                borderRadius: p.round ? p.size / 2 : 2,
                backgroundColor: p.color,
                opacity: burst.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y + 20] }) },
                  { rotate: p.rotate },
                ],
              },
            ]}
          />
        ))}
        <Animated.View
          style={[
            s.ring,
            {
              borderColor: k.color,
              opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2] }) }],
            },
          ]}
        />
        <Animated.View style={[s.check, { backgroundColor: k.color, transform: [{ scale: pop }] }]}>
          <Ionicons name="checkmark" size={44} color={colors.onPrimary} />
        </Animated.View>
      </View>
      <Animated.View
        style={{ alignItems: 'center', gap: spacing.xs, opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}
      >
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  center: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3 },
  check: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 280 },
});
