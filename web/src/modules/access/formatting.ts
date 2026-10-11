const dateTime = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

/** A moment of the API (UTC ISO 8601) as the person reads it, in their time zone. */
export function formatMoment(iso: string | null): string {
  return iso === null ? 'Nunca' : dateTime.format(new Date(iso));
}

const time = new Intl.DateTimeFormat('es-GT', { timeStyle: 'short' });

/** When something ends: just the time if it is today, the whole moment otherwise. */
export function formatUntil(iso: string, now: Date = new Date()): string {
  const moment = new Date(iso);
  return moment.toDateString() === now.toDateString() ? time.format(moment) : formatMoment(iso);
}
