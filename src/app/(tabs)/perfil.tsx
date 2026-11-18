import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountView } from '@/components/AccountView';
import { styles } from '@/components/ui';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {/* Com conta, a capa do perfil vai até o topo (a cena não tem recuo; ver (tabs)/_layout). */}
      <AccountView topInset={insets.top} />
    </View>
  );
}
