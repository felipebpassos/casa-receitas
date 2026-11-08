import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { colors, spacing } from '@/components/theme';
import { IconButton } from '@/components/ui';
import { useData } from '@/context/DataProvider';

function AccountButton() {
  const { isGuest } = useData();
  return (
    <IconButton
      name={isGuest ? 'person-circle-outline' : 'person-circle'}
      label="Conta"
      color={isGuest ? colors.muted : colors.primary}
      size={28}
      onPress={() => router.push('/account')}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <AccountButton />,
        headerRightContainerStyle: { paddingRight: spacing.lg },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Receitas',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="despensa"
        options={{
          title: 'Despensa',
          tabBarIcon: ({ color, size }) => <Ionicons name="basket-outline" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="semana"
        options={{
          title: 'Semana',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
