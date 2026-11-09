/**
 * Mentions in a comment. The server stores `@[user-id]` (a renamed person still reads right); the person types and reads
 * `@Name`. These pure functions convert between the two and find the `@` being typed, so every platform's composer
 * (web today, mobile later) shares the rule.
 */

const MARK = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;
/** The longest text after an `@` that still counts as a name being typed. */
const MAX_QUERY_LENGTH = 40;

export interface Mentioned {
  id: string;
  name: string;
}

export type BodySegment = { kind: 'text'; text: string } | { kind: 'mention'; id: string };

/** The comment as plain text and mention marks, in order, to draw each mention with the name the server returns. */
export function splitMentions(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(MARK)) {
    if (match.index > last) {
      segments.push({ kind: 'text', text: body.slice(last, match.index) });
    }
    segments.push({ kind: 'mention', id: match[1] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < body.length) {
    segments.push({ kind: 'text', text: body.slice(last) });
  }
  return segments;
}

const escapeForRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What the person typed, ready to send: each chosen `@Name` becomes `@[id]`. Only mentions still present in the text
 * are returned, so deleting the name from the text removes the mention.
 */
export function toWireBody(
  text: string,
  chosen: readonly Mentioned[],
): { body: string; mentions: Mentioned[] } {
  let body = text;
  const present: Mentioned[] = [];
  // Longest names first, so «Ana María» is not cut by «Ana».
  const byLength = [...chosen].sort((a, b) => b.name.length - a.name.length);
  for (const person of byLength) {
    const pattern = new RegExp(`@${escapeForRegex(person.name)}(?![\\p{L}\\p{N}])`, 'gu');
    if (pattern.test(body)) {
      body = body.replace(pattern, `@[${person.id}]`);
      present.push(person);
    }
  }
  return { body, mentions: present };
}

/** The reverse, to edit a stored comment: marks become `@Name` and the people they name become the chosen list. */
export function fromWireBody(
  body: string,
  known: readonly Mentioned[],
): { text: string; mentions: Mentioned[] } {
  const byId = new Map(known.map((person) => [person.id, person]));
  const mentions: Mentioned[] = [];
  const text = body.replace(MARK, (mark, id: string) => {
    const person = byId.get(id);
    if (!person) {
      return mark;
    }
    if (!mentions.some((item) => item.id === id)) {
      mentions.push(person);
    }
    return `@${person.name}`;
  });
  return { text, mentions };
}

/**
 * The `@` the caret is right after, when the person is typing a name: where it starts and the text typed after it. An
 * `@` inside a word (an email) does not count, and neither does a line break between it and the caret.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start === -1) {
    return null;
  }
  const previous = start === 0 ? '' : before.charAt(start - 1);
  const query = before.slice(start + 1);
  if ((previous !== '' && !/\s/.test(previous)) || /[\n\r]/.test(query) || query.includes('@')) {
    return null;
  }
  return query.length <= MAX_QUERY_LENGTH ? { start, query } : null;
}

/** Replaces the `@query` being typed with the chosen person's `@Name ` and says where the caret goes. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}
