import { Text, View } from 'react-native';
import { addDays, weekLabel, weekRelativeLabel } from '@/lib/dates';
import { colors, spacing } from './theme';
import { IconButton, styles } from './ui';

export function WeekNavigator({ weekStart, onChange }: { weekStart: string; onChange: (weekStart: string) => void }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between', paddingVertical: spacing.sm }]}>
      <IconButton name="chevron-back" label="Semana anterior" color={colors.primary} size={26} onPress={() => onChange(addDays(weekStart, -7))} />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.subtitle}>{weekRelativeLabel(weekStart)}</Text>
        <Text style={styles.muted}>Semana de {weekLabel(weekStart)}</Text>
      </View>
      <IconButton name="chevron-forward" label="Próxima semana" color={colors.primary} size={26} onPress={() => onChange(addDays(weekStart, 7))} />
    </View>
  );
}
