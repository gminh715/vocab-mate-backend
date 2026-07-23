import sanitizeHtml from 'sanitize-html';

const ARTICLE_HTML_POLICY: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'div',
    'span',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'mark',
    'br',
    'hr',
    'a',
    'img',
    'figure',
    'figcaption',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'pre',
    'code',
  ],
  allowedAttributes: {
    '*': ['data-sentence-id', 'data-term-id'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

export class HtmlSanitizerHelper {
  static sanitize(value: string): string {
    return sanitizeHtml(value, ARTICLE_HTML_POLICY).trim();
  }
}
