import { View } from 'react-native';
import { AccountView } from '@/components/AccountView';
import { styles } from '@/components/ui';

export default function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <AccountView />
    </View>
  );
}
