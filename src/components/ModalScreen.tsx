import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from './theme';
import { IconButton, styles } from './ui';

/** Modal em tela cheia com cabeçalho e botão de fechar. */
export function ModalScreen({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View
              style={[
                styles.row,
                { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <IconButton name="close" label="Fechar" color={colors.text} onPress={onClose} />
              <Text style={[styles.subtitle, { flex: 1 }]}>{title}</Text>
            </View>
            {children}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
