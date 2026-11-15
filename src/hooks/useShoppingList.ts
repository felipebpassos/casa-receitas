import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { today, weekStartOf } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { emptyWeekList, pruneWeeks, type ListStore, type WeekList } from '@/lib/shopping';

const keyFor = (userId: string | null) => `receitas-de-casa:shopping:v1:${userId ?? 'local'}`;

/**
 * Riscos e itens avulsos da lista de compras de uma semana.
 * Ficam só neste celular (AsyncStorage), nunca no banco. Semanas passadas são descartadas.
 */
export function useShoppingList(weekStart: string) {
  const { userId } = useAuth();
  const storageKey = keyFor(userId);
  const [store, setStore] = useState<ListStore>({});

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then(
      (raw) => !cancelled && setStore(raw ? pruneWeeks(JSON.parse(raw) as ListStore, weekStartOf(today())) : {}),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const update = useCallback(
    (mutate: (week: WeekList) => WeekList) =>
      setStore((s) => {
        const next = { ...s, [weekStart]: mutate(s[weekStart] ?? emptyWeekList()) };
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      }),
    [storageKey, weekStart],
  );

  const list = store[weekStart] ?? emptyWeekList();

  return {
    list,
    setChecked: (keys: string[], checked: boolean) =>
      update((w) => {
        const rest = w.checked.filter((k) => !keys.includes(k));
        return { ...w, checked: checked ? [...rest, ...keys] : rest };
      }),
    addExtra: (name: string, quantity: number | null, unit: string | null) =>
      update((w) => ({ ...w, extras: [...w.extras, { id: newId(), name: name.trim(), quantity, unit, checked: false }] })),
    toggleExtra: (id: string) => update((w) => ({ ...w, extras: w.extras.map((e) => (e.id === id ? { ...e, checked: !e.checked } : e)) })),
    removeExtra: (id: string) => update((w) => ({ ...w, extras: w.extras.filter((e) => e.id !== id) })),
    reset: () => update(() => emptyWeekList()),
  };
}
