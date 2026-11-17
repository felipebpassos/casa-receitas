import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecipeKind } from '@/lib/types';
import { KIND, KindIcon } from './RecipeKind';
import { colors, fonts, radius, spacing } from './theme';
import { Button } from './ui';

const useNativeDriver = Platform.OS !== 'web';

/** Pergunta o que cadastrar (Receita ou Preparo) ao tocar no "+". */
export function NewRecipeDialog({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (kind: RecipeKind) => void }) {
  if (!visible) return null;
  return <DialogCard onClose={onClose} onSelect={onSelect} />;
}

function DialogCard({ onClose, onSelect }: { onClose: () => void; onSelect: (kind: RecipeKind) => void }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver, friction: 8, tension: 90 }).start();
  }, [anim]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
        <Animated.View
          accessibilityViewIsModal
          style={[s.card, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}
        >
          <Text style={s.title}>O que deseja criar?</Text>
          {(['RECIPE', 'PREP'] as const).map((kind) => (
            <Option key={kind} kind={kind} onPress={() => onSelect(kind)} />
          ))}
          <Button title="Cancelar" variant="ghost" onPress={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function Option({ kind, onPress }: { kind: RecipeKind; onPress: () => void }) {
  const k = KIND[kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${k.label}. ${k.description} Exemplos: ${k.examples}`}
      style={({ pressed }) => [s.option, pressed && { backgroundColor: k.background, borderColor: k.color }]}
    >
      <KindIcon kind={kind} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.optionTitle}>{k.label}</Text>
        <Text style={s.optionText}>{k.description}</Text>
        <Text style={[s.optionExamples, { color: k.color }]}>{k.examples}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,52,46,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
    shadowColor: '#3D342E',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: { fontFamily: fonts.serifSemiBold, fontSize: 20, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionTitle: { fontFamily: fonts.serifSemiBold, fontSize: 17, color: colors.text },
  optionText: { fontSize: 13, lineHeight: 18, color: colors.muted },
  optionExamples: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
