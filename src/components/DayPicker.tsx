import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatShort, today, weekDays, weekStartOf, weekdayName } from '@/lib/dates';
import { ModalScreen } from './ModalScreen';
import { colors, radius, spacing } from './theme';
import { styles } from './ui';
import { WeekNavigator } from './WeekNavigator';

/** Escolhe um dia (de qualquer semana) para adicionar uma receita ao planejamento. */
export function DayPicker({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const todayIso = today();

  return (
    <ModalScreen visible={visible} title={title} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />
        {weekDays(weekStart).map((d) => {
          const past = d < todayIso;
          return (
            <Pressable
              key={d}
              onPress={() => onSelect(d)}
              style={({ pressed }) => [
                styles.card,
                styles.row,
                { borderRadius: radius.md, opacity: past ? 0.5 : 1 },
                pressed && { backgroundColor: colors.primaryLight },
                d === todayIso && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}
            >
              <Text style={[styles.subtitle, { flex: 1 }]}>{weekdayName(d)}</Text>
              <Text style={styles.muted}>{formatShort(d)}</Text>
            </Pressable>
          );
        })}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </ModalScreen>
  );
}
