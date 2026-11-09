import { describe, expect, it } from 'vitest';
import { fromWireBody, insertMention, mentionQueryAt, splitMentions, toWireBody } from './mentions';

const ANA = { id: '0192a1b2-0000-7000-8000-000000000001', name: 'Ana' };
const ANA_MARIA = { id: '0192a1b2-0000-7000-8000-000000000002', name: 'Ana María' };

describe('splitMentions', () => {
  it('separates the text from the marks, in order', () => {
    expect(splitMentions(`Hola @[${ANA.id}], revisa`)).toEqual([
      { kind: 'text', text: 'Hola ' },
      { kind: 'mention', id: ANA.id },
      { kind: 'text', text: ', revisa' },
    ]);
  });

  it('leaves a text without marks as it is, and ignores a malformed mark', () => {
    expect(splitMentions('Sin marcas @[no-es-id]')).toEqual([
      { kind: 'text', text: 'Sin marcas @[no-es-id]' },
    ]);
    expect(splitMentions('')).toEqual([]);
  });
});

describe('toWireBody', () => {
  it('turns each chosen @Name into its mark and keeps the longest name whole', () => {
    const result = toWireBody('@Ana María y @Ana, vean esto', [ANA, ANA_MARIA]);
    expect(result.body).toBe(`@[${ANA_MARIA.id}] y @[${ANA.id}], vean esto`);
    expect(result.mentions.map((person) => person.id).sort()).toEqual(
      [ANA.id, ANA_MARIA.id].sort(),
    );
  });

  it('drops a mention whose name is no longer in the text, and does not cut a longer word', () => {
    expect(toWireBody('Hola', [ANA])).toEqual({ body: 'Hola', mentions: [] });
    expect(toWireBody('@Anabel no es Ana', [ANA]).mentions).toEqual([]);
  });

  it('does not read a name as a pattern', () => {
    const odd = { id: ANA.id, name: 'A.(B)+' };
    expect(toWireBody('@A.(B)+ ok', [odd]).body).toBe(`@[${ANA.id}] ok`);
  });
});

describe('fromWireBody', () => {
  it('turns the marks of known people into @Name and lists them once', () => {
    const result = fromWireBody(`@[${ANA.id}] y @[${ANA.id}]`, [ANA]);
    expect(result).toEqual({ text: '@Ana y @Ana', mentions: [ANA] });
  });

  it('keeps the mark of someone it does not know', () => {
    expect(fromWireBody(`@[${ANA.id}]`, []).text).toBe(`@[${ANA.id}]`);
  });
});

describe('mentionQueryAt', () => {
  it('finds the name being typed after an @ that starts a word', () => {
    expect(mentionQueryAt('Hola @An', 8)).toEqual({ start: 5, query: 'An' });
    expect(mentionQueryAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionQueryAt('Hola @Ana Ma', 12)).toEqual({ start: 5, query: 'Ana Ma' });
  });

  it('ignores an @ inside a word, a line break and a second @', () => {
    expect(mentionQueryAt('correo@host', 11)).toBeNull();
    expect(mentionQueryAt('@Ana\nhola', 9)).toBeNull();
    expect(mentionQueryAt('@a @b', 5)).toEqual({ start: 3, query: 'b' });
    expect(mentionQueryAt('sin arroba', 10)).toBeNull();
  });

  it('gives up on a very long text', () => {
    expect(mentionQueryAt(`@${'a'.repeat(50)}`, 51)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the typed @query and puts the caret after the name', () => {
    expect(insertMention('Hola @An y más', 5, 8, 'Ana')).toEqual({
      text: 'Hola @Ana  y más',
      caret: 10,
    });
  });
});
