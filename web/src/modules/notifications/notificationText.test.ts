import type { components } from '@soltec/shared';
import { describe, expect, it } from 'vitest';
import { notificationPath, notificationText, timeAgo } from './notificationText';

type Notification = components['schemas']['Notification'];

const base: Notification = {
  id: '0192f1c2-7d3a-7a11-8f2e-000000000001',
  type: 'assigned',
  subject: {
    type: 'task',
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000a1',
    title: 'Instalar el equipo',
  },
  actor: { id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1', name: 'Olga Owner' },
  data: {},
  is_read: false,
  read_at: null,
  created_at: '2026-11-25T12:00:00.000Z',
};
const of = (patch: Partial<Notification>): Notification => ({ ...base, ...patch });

describe('notificationText', () => {
  it('writes the sentence of each type from the actor, the record and the data', () => {
    expect(notificationText(base)).toBe('Olga Owner te asignó la tarea «Instalar el equipo».');
    expect(notificationText(of({ type: 'mention' }))).toBe(
      'Olga Owner te mencionó en la tarea «Instalar el equipo».',
    );
    expect(
      notificationText(of({ type: 'state_changed', data: { from: 'Asignada', to: 'Aceptada' } })),
    ).toBe('Olga Owner cambió el estado de la tarea «Instalar el equipo»: de Asignada a Aceptada.');
    expect(
      notificationText(of({ type: 'assignee_changed', data: { from: 'Ana', to: 'Luis' } })),
    ).toContain('de Ana a Luis');
    expect(
      notificationText(
        of({ type: 'due_date_changed', data: { from: '2026-12-15', to: '2026-12-20' } }),
      ),
    ).toMatch(/del .*15.* al .*20/);
  });

  it('writes a reminder without an actor and with the record capitalised', () => {
    const reminder = of({ type: 'due_soon', actor: null, data: { due_date: '2026-11-26' } });

    expect(notificationText(reminder)).toMatch(
      /^La tarea «Instalar el equipo» vence mañana, el .*26/,
    );
    expect(notificationText(of({ ...reminder, type: 'overdue' }))).toContain('venció el');
  });

  it('names a client and falls back to dashes when the data lacks a value', () => {
    const client = of({
      type: 'client_seller_added',
      subject: { type: 'client', id: base.subject.id, title: 'Acme' },
    });

    expect(notificationText(client)).toBe('Olga Owner te agregó como asesor del cliente «Acme».');
    expect(notificationText(of({ type: 'state_changed' }))).toContain('de — a —');
  });
});

describe('notificationPath', () => {
  it('opens the screen of the record the notification is about', () => {
    expect(notificationPath(base)).toBe(`/tareas/${base.subject.id}`);
    expect(notificationPath(of({ subject: { ...base.subject, type: 'client' } }))).toBe(
      `/clientes/${base.subject.id}`,
    );
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');

  it('says how long ago in the unit people use, and a date from a week on', () => {
    expect(timeAgo('2026-11-25T11:59:40.000Z', now)).toBe('Ahora');
    expect(timeAgo('2026-11-25T11:45:00.000Z', now)).toBe('Hace 15 min');
    expect(timeAgo('2026-11-25T09:00:00.000Z', now)).toBe('Hace 3 h');
    expect(timeAgo('2026-11-23T12:00:00.000Z', now)).toBe('Hace 2 d');
    expect(timeAgo('2026-11-10T12:00:00.000Z', now)).toMatch(/10/);
  });
});
