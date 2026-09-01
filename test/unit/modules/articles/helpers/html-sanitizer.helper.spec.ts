import { HtmlSanitizerHelper } from '../../../../../src/modules/articles/helpers/html-sanitizer.helper';

describe('HtmlSanitizerHelper', () => {
  it('preserves reader markup and supported sentence/term markers', () => {
    const result = HtmlSanitizerHelper.sanitize(
      '<h2>Heading</h2><p data-sentence-id="s1"><strong data-term-id="t1">Word</strong></p>',
    );

    expect(result).toBe(
      '<h2>Heading</h2><p data-sentence-id="s1"><strong data-term-id="t1">Word</strong></p>',
    );
  });

  it('removes scripts, event handlers, styles, unsupported tags, and dangerous URLs', () => {
    const result = HtmlSanitizerHelper.sanitize(`
      <script>alert(1)</script>
      <style>body { display: none }</style>
      <p onclick="steal()" style="color:red">Safe</p>
      <iframe src="https://evil.example"></iframe>
      <a href="javascript:alert(1)" onmouseover="bad()">link</a>
      <img src="data:text/html,bad" onerror="bad()">
    `);

    expect(result).toContain('<p>Safe</p>');
    expect(result).toContain('<a rel="noopener noreferrer">link</a>');
    expect(result).toContain('<img />');
    expect(result).not.toMatch(
      /script|style=|onclick|onmouseover|onerror|iframe|javascript:|data:/i,
    );
  });

  it('allows only supported text alignment styles', () => {
    const result = HtmlSanitizerHelper.sanitize(
      '<p style="text-align: center; color: red">Centered</p><h2 style="text-align: justify">Heading</h2>',
    );

    expect(result).toBe(
      '<p style="text-align:center">Centered</p><h2 style="text-align:justify">Heading</h2>',
    );
  });

  it('treats entity and void-tag serialization as policy-equivalent', () => {
    const serialized =
      '<p><span data-sentence-id="s1"><br>Quoted &#x201c;text&#x201d;.</span></p>';

    expect(HtmlSanitizerHelper.isWithinPolicy(serialized)).toBe(true);
    expect(
      HtmlSanitizerHelper.isWithinPolicy(
        '<p onclick="bad()">Unsafe<script>alert(1)</script></p>',
      ),
    ).toBe(false);
  });

  it('is deterministic', () => {
    const input = '<p><a href="https://example.com">Safe</a></p>';
    expect(HtmlSanitizerHelper.sanitize(input)).toBe(
      HtmlSanitizerHelper.sanitize(input),
    );
  });
});
