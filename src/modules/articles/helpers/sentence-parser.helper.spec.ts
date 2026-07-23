import { HtmlSanitizerHelper } from './html-sanitizer.helper';
import { SentenceParserHelper } from './sentence-parser.helper';

const idFactory = (...ids: string[]): (() => string) => {
  let index = 0;
  return () => ids[index++] ?? `sentence-${index}`;
};

describe('SentenceParserHelper', () => {
  it('parses headings and paragraphs in deterministic document order', () => {
    const result = SentenceParserHelper.parse(
      '<h2>News today.</h2><p>First paragraph. Second sentence!</p>',
      idFactory('id-1', 'id-2', 'id-3'),
    );

    expect(result.sentences).toEqual([
      { id: 'id-1', sentenceOrder: 1, sentenceText: 'News today.' },
      { id: 'id-2', sentenceOrder: 2, sentenceText: 'First paragraph.' },
      { id: 'id-3', sentenceOrder: 3, sentenceText: 'Second sentence!' },
    ]);
    expect(result.contentHtml.match(/data-sentence-id=/g)).toHaveLength(3);
  });

  it('preserves and safely splits inline tags across sentence boundaries', () => {
    const result = SentenceParserHelper.parse(
      '<p>Hello <strong>world. Next</strong> idea?</p>',
      idFactory('id-1', 'id-2'),
    );

    expect(result.sentences.map(({ sentenceText }) => sentenceText)).toEqual([
      'Hello world.',
      'Next idea?',
    ]);
    expect(result.contentHtml.match(/data-sentence-id=/g)).toHaveLength(2);
    expect(result.contentHtml).toMatch(/<strong>world\.\s*<\/strong>/);
    expect(result.contentHtml).toContain('<strong>Next</strong> idea?');
  });

  it('handles punctuation, quotations, abbreviations, and Unicode text', () => {
    const result = SentenceParserHelper.parse(
      '<p>Dr. Smith asked, “Ready?” Cô ấy replied: “Vâng!” 😊</p>',
      idFactory('id-1', 'id-2'),
    );

    expect(result.sentences.map(({ sentenceText }) => sentenceText)).toEqual([
      'Dr. Smith asked, “Ready?”',
      'Cô ấy replied: “Vâng!” 😊',
    ]);
  });

  it('ignores empty and unsupported container-only content', () => {
    const result = SentenceParserHelper.parse(
      '<div><p>  </p><img src="https://example.com/image.png"></div>',
      idFactory('unused'),
    );

    expect(result.sentences).toEqual([]);
    expect(result.contentHtml).not.toContain('data-sentence-id');
  });

  it('operates on sanitizer output without reintroducing malicious HTML', () => {
    const sanitized = HtmlSanitizerHelper.sanitize(
      '<script>alert(1)</script><p onclick="bad()">Safe sentence.</p>',
    );
    const result = SentenceParserHelper.parse(sanitized, idFactory('safe-id'));

    expect(result.contentHtml).toContain('data-sentence-id="safe-id"');
    expect(result.contentHtml).not.toMatch(/script|onclick|alert/);
  });

  it('removes stale sentence and term markers before rebuilding', () => {
    const result = SentenceParserHelper.parse(
      '<p><span data-sentence-id="old"><span data-term-id="term-old">Old marker.</span></span> New sentence.</p>',
      idFactory('new-1', 'new-2'),
    );

    expect(result.contentHtml).not.toMatch(/old|data-term-id/);
    expect(result.contentHtml.match(/data-sentence-id=/g)).toHaveLength(2);
    expect(result.sentences.map(({ sentenceOrder }) => sentenceOrder)).toEqual([
      1, 2,
    ]);
  });

  it('produces the same annotation for the same input and IDs', () => {
    const html = '<p>One. Two.</p>';
    const first = SentenceParserHelper.parse(
      html,
      idFactory('stable-1', 'stable-2'),
    );
    const second = SentenceParserHelper.parse(
      html,
      idFactory('stable-1', 'stable-2'),
    );

    expect(second).toEqual(first);
  });

  it('force-style reparsing replaces markers without nesting them', () => {
    const first = SentenceParserHelper.parse(
      '<p>One sentence. Another sentence.</p>',
      idFactory('old-1', 'old-2'),
    );
    const reparsed = SentenceParserHelper.parse(
      first.contentHtml,
      idFactory('new-1', 'new-2'),
    );

    expect(reparsed.contentHtml).not.toContain('old-');
    expect(reparsed.contentHtml.match(/data-sentence-id=/g)).toHaveLength(2);
    expect(reparsed.contentHtml).not.toMatch(
      /data-sentence-id="new-[^"]+"[^>]*>\s*<span data-sentence-id=/,
    );
  });

  it('does not mutate caller-owned HTML when ID generation fails', () => {
    const html = '<p>First. Second.</p>';
    let calls = 0;

    expect(() =>
      SentenceParserHelper.parse(html, () => {
        calls += 1;
        if (calls === 2) throw new Error('annotation failed');
        return 'first-id';
      }),
    ).toThrow('annotation failed');
    expect(html).toBe('<p>First. Second.</p>');
  });
});
