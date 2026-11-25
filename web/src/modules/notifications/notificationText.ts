import type { components } from '@soltec/shared';
import { formatDay } from '../tasks/dates';

type Notification = components['schemas']['Notification'];

/** What each kind of record is called in a sentence and where its screen lives. */
const SUBJECTS: Record<string, { noun: string; path: string }> = {
  task: { noun: 'la tarea', path: '/tareas/' },
  ticket: { noun: 'el ticket', path: '/tickets/' },
  client: { noun: 'el cliente', path: '/clientes/' },
};

/** The screen a notification opens. */
export function notificationPath(notification: Notification): string {
  const subject = SUBJECTS[notification.subject.type];
  return `${subject?.path ?? '/'}${notification.subject.id}`;
}

function text(data: Notification['data'], key: string): string {
  const value = data[key];
  return typeof value === 'string' && value !== '' ? value : '—';
}

function date(data: Notification['data'], key: string): string {
  const value = data[key];
  return typeof value === 'string' ? formatDay(value) : '—';
}

/** The sentence of a notification, written from its type and what the server sent with it. */
export function notificationText(notification: Notification): string {
  const actor = notification.actor?.name ?? 'Alguien';
  const noun = SUBJECTS[notification.subject.type]?.noun ?? 'el registro';
  const target = `${noun} «${notification.subject.title}»`;
  const data = notification.data;

  switch (notification.type) {
    case 'assigned':
      return `${actor} te asignó ${target}.`;
    case 'unassigned':
      return `${actor} asignó a otra persona ${target}, que tenías a tu cargo.`;
    case 'assignee_changed':
      return `${actor} cambió la persona asignada de ${target}: de ${text(data, 'from')} a ${text(data, 'to')}.`;
    case 'comment':
      return `${actor} comentó en ${target}.`;
    case 'mention':
      return `${actor} te mencionó en ${target}.`;
    case 'state_changed':
      return `${actor} cambió el estado de ${target}: de ${text(data, 'from')} a ${text(data, 'to')}.`;
    case 'due_date_changed':
      return `${actor} cambió el vencimiento de ${target}: del ${date(data, 'from')} al ${date(data, 'to')}.`;
    case 'due_soon':
      return `${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)} «${notification.subject.title}» vence mañana, el ${date(data, 'due_date')}.`;
    case 'overdue':
      return `${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)} «${notification.subject.title}» venció el ${date(data, 'due_date')}.`;
    case 'client_seller_added':
      return `${actor} te agregó como asesor del cliente «${notification.subject.title}».`;
    case 'client_seller_removed':
      return `${actor} te quitó como asesor del cliente «${notification.subject.title}».`;
  }
}

/** How long ago, the way people say it in a list of notices; a week or more shows the date. */
export function timeAgo(isoMoment: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(isoMoment).getTime()) / 60_000);
  if (minutes < 1) {
    return 'Ahora';
  }
  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Hace ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days < 7 ? `Hace ${days} d` : formatDay(isoMoment.slice(0, 10));
}
