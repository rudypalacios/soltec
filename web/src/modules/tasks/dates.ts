const day = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' });

/** A calendar date of the API (`2026-12-15`) as the person reads it. It is built from its parts, with no time zone. */
export function formatDay(isoDate: string): string {
  const [year, month, date] = isoDate.split('-').map(Number);
  if (!year || !month || !date) {
    return isoDate;
  }
  return day.format(new Date(year, month - 1, date));
}

/** Today as `YYYY-MM-DD` in the person's own calendar. */
export function today(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${date}`;
}

/** A task is late when its date has passed and it is not closed. Dates in this format compare as text. */
export function isOverdue(task: { due_date: string; state: { is_terminal: boolean } }, now?: Date) {
  return !task.state.is_terminal && task.due_date < today(now);
}
