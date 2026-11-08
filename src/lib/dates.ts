// Datas são trabalhadas como strings locais "YYYY-MM-DD" (coluna `date` do Postgres),
// evitando problemas de fuso horário com Date/UTC.

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Segunda-feira da semana da data informada. */
export function weekStartOf(iso: string): string {
  const d = parseISODate(iso);
  const diff = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function today(): string {
  return toISODate(new Date());
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getDay()];
}

export function weekLabel(weekStart: string): string {
  return `${formatShort(weekStart)} a ${formatShort(addDays(weekStart, 6))}`;
}

/** "Esta semana", "Próxima semana", "Em 3 semanas", "Semana passada"... */
export function weekRelativeLabel(weekStart: string): string {
  const current = weekStartOf(today());
  const diffWeeks = Math.round(
    (parseISODate(weekStart).getTime() - parseISODate(current).getTime()) / (7 * 86400000),
  );
  if (diffWeeks === 0) return 'Esta semana';
  if (diffWeeks === 1) return 'Próxima semana';
  if (diffWeeks === -1) return 'Semana passada';
  return diffWeeks > 0 ? `Em ${diffWeeks} semanas` : `Há ${-diffWeeks} semanas`;
}
