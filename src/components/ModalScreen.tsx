import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from './theme';
import { IconButton, styles } from './ui';

/** Modal em tela cheia com cabeçalho e botão de fechar. */
export function ModalScreen({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Botões à direita do título. */
  actions?: ReactNode;
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
                { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <IconButton name="close" label="Fechar" color={colors.text} onPress={onClose} />
              <View style={{ flex: 1 }}>
                <Text style={styles.subtitle}>{title}</Text>
                {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
              </View>
              {actions}
            </View>
            {children}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
