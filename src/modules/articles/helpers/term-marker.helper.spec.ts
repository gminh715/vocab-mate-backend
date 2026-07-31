import {
  TermMarkerConflictError,
  TermMarkerHelper,
  TermValueNotFoundError,
} from './term-marker.helper';

const sentence = (content: string): string =>
  `<p><span data-sentence-id="sentence-1">${content}</span></p>`;

describe('TermMarkerHelper', () => {
  it('matches WORD values case-insensitively with Unicode-aware boundaries', () => {
    const html = TermMarkerHelper.insert(
      sentence('Art helps artists, and ART inspires.'),
      'sentence-1',
      'term-1',
      'art',
      'WORD',
    );

    expect(html.match(/data-term-id="term-1"/g)).toHaveLength(2);
    expect(html).toContain('>Art</span> helps artists');
    expect(html).toContain('>ART</span> inspires');
  });

  it('matches every exact PHRASE occurrence deterministically', () => {
    const html = TermMarkerHelper.insert(
      sentence('Digital tools help. DIGITAL TOOLS connect people.'),
      'sentence-1',
      'term-1',
      'digital tools',
      'PHRASE',
    );

    expect(html.match(/data-term-id="term-1"/g)).toHaveLength(2);
  });

  it('inserts and requires exactly one marker for AI candidate approval', () => {
    const html = TermMarkerHelper.insertFirst(
      sentence('Digital tools help. Digital tools connect people.'),
      'sentence-1',
      'term-1',
      'digital tools',
      'PHRASE',
    );

    expect(html.match(/data-term-id="term-1"/g)).toHaveLength(1);
    expect(() =>
      TermMarkerHelper.assertSingleMarker(html, 'sentence-1', 'term-1'),
    ).not.toThrow();

    const duplicated = html.replace(
      'Digital tools connect',
      '<span data-term-id="term-1">Digital tools</span> connect',
    );
    expect(() =>
      TermMarkerHelper.assertSingleMarker(duplicated, 'sentence-1', 'term-1'),
    ).toThrow(TermMarkerConflictError);
  });

  it('preserves inline elements when a phrase crosses text nodes', () => {
    const html = TermMarkerHelper.insert(
      sentence('take <em>into</em> account today.'),
      'sentence-1',
      'term-1',
      'take into account',
      'PHRASE',
    );

    expect(html).toContain(
      '<span data-term-id="term-1">take <em>into</em> account</span>',
    );
  });

  it('rejects missing values, overlaps, nested markers, and duplicate IDs', () => {
    expect(() =>
      TermMarkerHelper.insert(
        sentence('A sentence.'),
        'sentence-1',
        'term-1',
        'missing',
        'WORD',
      ),
    ).toThrow(TermValueNotFoundError);

    const existing = sentence(
      '<span data-term-id="old-term">digital</span> tools work.',
    );
    expect(() =>
      TermMarkerHelper.insert(
        existing,
        'sentence-1',
        'term-1',
        'digital tools',
        'PHRASE',
      ),
    ).toThrow(TermMarkerConflictError);

    expect(() =>
      TermMarkerHelper.insert(
        sentence(
          '<span data-term-id="outer"><span data-term-id="inner">word</span></span>',
        ),
        'sentence-1',
        'term-1',
        'word',
        'WORD',
      ),
    ).toThrow(TermMarkerConflictError);

    expect(() =>
      TermMarkerHelper.insert(
        `${sentence('word')}<p><span data-term-id="term-1">other</span></p>`,
        'sentence-1',
        'term-1',
        'word',
        'WORD',
      ),
    ).toThrow(TermMarkerConflictError);
  });

  it('unwraps every occurrence while preserving visible text and formatting', () => {
    const marked = TermMarkerHelper.insert(
      sentence('A <strong>digital tool</strong> is a tool.'),
      'sentence-1',
      'term-1',
      'tool',
      'WORD',
    );
    const unwrapped = TermMarkerHelper.unwrap(marked, 'sentence-1', 'term-1');

    expect(unwrapped).not.toContain('data-term-id');
    expect(unwrapped).toContain('<strong>digital tool</strong>');
    expect(unwrapped).toContain(' is a tool.');
  });

  it('replaces old markers without leaving stale or nested IDs', () => {
    const oldHtml = TermMarkerHelper.insert(
      sentence('Digital tools improve learning.'),
      'sentence-1',
      'term-1',
      'Digital',
      'WORD',
    );
    const replaced = TermMarkerHelper.replace(
      oldHtml,
      'sentence-1',
      'term-1',
      'Digital tools',
      'PHRASE',
    );

    expect(replaced.match(/data-term-id="term-1"/g)).toHaveLength(1);
    expect(replaced).toContain('>Digital tools</span> improve');
    expect(replaced).not.toMatch(
      /data-term-id="term-1"[^>]*>\s*<span data-term-id=/,
    );
  });

  it('keeps exactly one marker when replacing an approved AI occurrence', () => {
    const oldHtml = TermMarkerHelper.insertFirst(
      sentence('Digital tools help. Digital tools connect people.'),
      'sentence-1',
      'term-1',
      'Digital',
      'WORD',
    );
    const replaced = TermMarkerHelper.replaceFirst(
      oldHtml,
      'sentence-1',
      'term-1',
      'Digital tools',
      'PHRASE',
    );

    expect(replaced.match(/data-term-id="term-1"/g)).toHaveLength(1);
    expect(replaced).toContain('>Digital tools</span> help');
  });
});
