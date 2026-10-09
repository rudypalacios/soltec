const dateTime = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

/** A moment of the API (UTC ISO 8601) as the person reads it, in their time zone. */
export function formatMoment(iso: string | null): string {
  return iso === null ? 'Nunca' : dateTime.format(new Date(iso));
}
