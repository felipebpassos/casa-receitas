import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/components/theme';
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
        // Sem cabeçalho, o conteúdo começa abaixo da barra de status.
        sceneStyle: { backgroundColor: colors.background, paddingTop: insets.top },
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
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
