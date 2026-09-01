import sanitizeHtml from 'sanitize-html';
import { DomUtils, parseDocument } from 'htmlparser2';
import { type ChildNode, isTag } from 'domhandler';

const TEXT_ALIGNMENT_STYLE = {
  'text-align': [/^(?:left|center|right|justify)$/u],
};

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
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    h5: ['style'],
    h6: ['style'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowedStyles: {
    p: TEXT_ALIGNMENT_STYLE,
    h1: TEXT_ALIGNMENT_STYLE,
    h2: TEXT_ALIGNMENT_STYLE,
    h3: TEXT_ALIGNMENT_STYLE,
    h4: TEXT_ALIGNMENT_STYLE,
    h5: TEXT_ALIGNMENT_STYLE,
    h6: TEXT_ALIGNMENT_STYLE,
  },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

const canonicalizeHtml = (value: string): string => {
  const document = parseDocument(value, { decodeEntities: true });
  const sortAttributes = (nodes: ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue;
      const attributes = Object.entries(node.attribs).sort(([left], [right]) =>
        left.localeCompare(right),
      );
      for (const name of Object.keys(node.attribs)) {
        delete node.attribs[name];
      }
      for (const [name, attributeValue] of attributes) {
        node.attribs[name] = attributeValue;
      }
      sortAttributes(node.children);
    }
  };
  sortAttributes(document.children);
  return DomUtils.getInnerHTML(document);
};

export class HtmlSanitizerHelper {
  static sanitize(value: string): string {
    return sanitizeHtml(value, ARTICLE_HTML_POLICY).trim();
  }

  static isWithinPolicy(value: string): boolean {
    return canonicalizeHtml(value) === canonicalizeHtml(this.sanitize(value));
  }
}
