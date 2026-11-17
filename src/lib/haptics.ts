import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Vibrações curtas de feedback. Sem efeito na web (e nunca quebram a tela se falharem). */
const enabled = Platform.OS !== 'web';

export const haptic = {
  tap: () => enabled && Haptics.selectionAsync().catch(() => undefined),
  step: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  warning: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
};
