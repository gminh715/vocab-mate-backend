import { randomUUID } from 'node:crypto';
import { DomUtils, parseDocument } from 'htmlparser2';
import {
  type ChildNode,
  type Document,
  Element,
  type ParentNode,
  Text,
  isTag,
  isText,
} from 'domhandler';

const READING_ELEMENT_NAMES = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'figcaption',
]);
const CONDITIONAL_READING_ELEMENT_NAMES = new Set([
  'blockquote',
  'li',
  'th',
  'td',
]);
const NON_READER_ELEMENT_NAMES = new Set(['script', 'style', 'noscript']);
const SENTENCE_MARKER_ATTRIBUTE = 'data-sentence-id';
const TERM_MARKER_ATTRIBUTE = 'data-term-id';
const SENTENCE_MARKER_TAG = 'span';
const NON_TERMINAL_ABBREVIATION =
  /(?:^|\s)(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Mt|Gen|Rep|Sen|Gov|Capt|Lt|Col|Sgt)\.$/iu;
const INITIAL_ABBREVIATION = /(?:^|\s)\p{Lu}\.$/u;

export interface ParsedSentence {
  id: string;
  sentenceOrder: number;
  sentenceText: string;
}

export interface ParsedArticleContent {
  contentHtml: string;
  sentences: ParsedSentence[];
}

interface SentenceRange extends ParsedSentence {
  start: number;
  end: number;
}

interface BlockPlan {
  element: Element;
  textOffsets: WeakMap<ChildNode, { start: number; end: number }>;
  sentences: SentenceRange[];
}

interface LabelledNodes {
  sentenceId: string | null;
  nodes: ChildNode[];
}

export class SentenceParserHelper {
  static parse(
    contentHtml: string,
    createSentenceId: () => string = randomUUID,
  ): ParsedArticleContent {
    const document = parseDocument(contentHtml, { decodeEntities: true });
    this.removeStaleMarkers(document);
    const readingElements = this.findReadingElements(document);
    const plans: BlockPlan[] = [];
    const sentences: ParsedSentence[] = [];

    for (const element of readingElements) {
      const { text, offsets } = this.extractVisibleText(element);
      const ranges = this.segment(text);
      const plannedSentences = ranges.map(({ start, end, sentenceText }) => {
        const sentence: SentenceRange = {
          id: createSentenceId(),
          sentenceOrder: sentences.length + 1,
          sentenceText,
          start,
          end,
        };
        sentences.push({
          id: sentence.id,
          sentenceOrder: sentence.sentenceOrder,
          sentenceText: sentence.sentenceText,
        });
        return sentence;
      });

      if (plannedSentences.length > 0) {
        plans.push({
          element,
          textOffsets: offsets,
          sentences: plannedSentences,
        });
      }
    }

    for (const plan of plans) {
      this.annotateBlock(plan);
    }

    return {
      contentHtml: DomUtils.getInnerHTML(document),
      sentences,
    };
  }

  private static findReadingElements(document: Document): Element[] {
    const elements: Element[] = [];

    const visit = (nodes: ChildNode[]): void => {
      for (const node of nodes) {
        if (!isTag(node) || NON_READER_ELEMENT_NAMES.has(node.name)) continue;
        if (READING_ELEMENT_NAMES.has(node.name)) {
          elements.push(node);
          continue;
        }
        if (
          CONDITIONAL_READING_ELEMENT_NAMES.has(node.name) &&
          !this.hasReadingDescendant(node)
        ) {
          elements.push(node);
          continue;
        }
        visit(node.children);
      }
    };

    visit(document.children);
    return elements;
  }

  private static hasReadingDescendant(element: Element): boolean {
    return element.children.some((child) => {
      if (!isTag(child)) return false;
      return (
        READING_ELEMENT_NAMES.has(child.name) ||
        CONDITIONAL_READING_ELEMENT_NAMES.has(child.name) ||
        this.hasReadingDescendant(child)
      );
    });
  }

  private static extractVisibleText(element: Element): {
    text: string;
    offsets: WeakMap<ChildNode, { start: number; end: number }>;
  } {
    const offsets = new WeakMap<ChildNode, { start: number; end: number }>();
    let text = '';

    const visit = (nodes: ChildNode[]): void => {
      for (const node of nodes) {
        if (isText(node)) {
          const start = text.length;
          text += node.data;
          offsets.set(node, { start, end: text.length });
          continue;
        }
        if (!isTag(node) || NON_READER_ELEMENT_NAMES.has(node.name)) continue;
        if (node.name === 'br') {
          const start = text.length;
          text += '\n';
          offsets.set(node, { start, end: text.length });
          continue;
        }
        visit(node.children);
      }
    };

    visit(element.children);
    return { text, offsets };
  }

  private static segment(
    text: string,
  ): Array<{ start: number; end: number; sentenceText: string }> {
    const rawSegments = [
      ...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text),
    ].map(({ index, segment }) => ({
      start: index,
      end: index + segment.length,
    }));
    const merged: Array<{ start: number; end: number }> = [];

    for (const segment of rawSegments) {
      const previous = merged.at(-1);
      const segmentText = text.slice(segment.start, segment.end).trim();
      if (
        previous &&
        (this.isNonTerminalAbbreviation(
          text.slice(previous.start, previous.end),
        ) ||
          !/[\p{L}\p{N}]/u.test(segmentText))
      ) {
        previous.end = segment.end;
      } else {
        merged.push({ ...segment });
      }
    }

    return merged.flatMap(({ start, end }) => {
      const value = text.slice(start, end);
      const leadingWhitespace = value.match(/^\s*/u)?.[0].length ?? 0;
      const trailingWhitespace = value.match(/\s*$/u)?.[0].length ?? 0;
      const trimmedStart = start + leadingWhitespace;
      const trimmedEnd = end - trailingWhitespace;
      if (trimmedStart >= trimmedEnd) return [];

      const sentenceText = text
        .slice(trimmedStart, trimmedEnd)
        .replace(/\s+/gu, ' ')
        .trim();
      return sentenceText
        ? [{ start: trimmedStart, end: trimmedEnd, sentenceText }]
        : [];
    });
  }

  private static isNonTerminalAbbreviation(value: string): boolean {
    const trimmed = value.trimEnd();
    return (
      NON_TERMINAL_ABBREVIATION.test(trimmed) ||
      INITIAL_ABBREVIATION.test(trimmed)
    );
  }

  private static annotateBlock(plan: BlockPlan): void {
    const pieces = this.normalizeUnlabelledPieces(
      plan.element.children.flatMap((node) => this.partitionNode(node, plan)),
    );
    const children = pieces.flatMap(({ sentenceId, nodes }) => {
      if (!sentenceId) return nodes;
      return [
        new Element(
          SENTENCE_MARKER_TAG,
          {
            [SENTENCE_MARKER_ATTRIBUTE]: sentenceId,
          },
          nodes,
        ),
      ];
    });
    this.setChildren(plan.element, children);
  }

  private static partitionNode(
    node: ChildNode,
    plan: BlockPlan,
  ): LabelledNodes[] {
    const offset = plan.textOffsets.get(node);
    if (isText(node) && offset) {
      const boundaries = new Set([offset.start, offset.end]);
      for (const sentence of plan.sentences) {
        if (sentence.start > offset.start && sentence.start < offset.end) {
          boundaries.add(sentence.start);
        }
        if (sentence.end > offset.start && sentence.end < offset.end) {
          boundaries.add(sentence.end);
        }
      }
      const sortedBoundaries = [...boundaries].sort(
        (left, right) => left - right,
      );
      return sortedBoundaries.slice(0, -1).map((start, index) => {
        const end = sortedBoundaries[index + 1];
        return {
          sentenceId: this.sentenceAt(plan.sentences, start, end),
          nodes: [
            new Text(node.data.slice(start - offset.start, end - offset.start)),
          ],
        };
      });
    }

    if (!isTag(node))
      return [{ sentenceId: null, nodes: [node.cloneNode(true)] }];
    if (node.name === 'br') {
      return [
        {
          sentenceId: offset
            ? this.sentenceAt(plan.sentences, offset.start, offset.end)
            : null,
          nodes: [node.cloneNode(true)],
        },
      ];
    }

    const childPieces = this.normalizeUnlabelledPieces(
      node.children.flatMap((child) => this.partitionNode(child, plan)),
    );
    if (childPieces.length === 0) {
      return [{ sentenceId: null, nodes: [node.cloneNode(true)] }];
    }

    return childPieces.map(({ sentenceId, nodes }) => {
      const clone = node.cloneNode(false);
      this.setChildren(clone, nodes);
      return { sentenceId, nodes: [clone] };
    });
  }

  private static sentenceAt(
    sentences: SentenceRange[],
    start: number,
    end: number,
  ): string | null {
    return (
      sentences.find(
        (sentence) => start >= sentence.start && end <= sentence.end,
      )?.id ?? null
    );
  }

  private static normalizeUnlabelledPieces(
    pieces: LabelledNodes[],
  ): LabelledNodes[] {
    const labelled = pieces.map((piece, index) => {
      if (piece.sentenceId) return piece;
      const previous = pieces
        .slice(0, index)
        .findLast(({ sentenceId }) => sentenceId);
      const next = pieces.slice(index + 1).find(({ sentenceId }) => sentenceId);
      return {
        ...piece,
        sentenceId: previous?.sentenceId ?? next?.sentenceId ?? null,
      };
    });
    const merged: LabelledNodes[] = [];
    for (const piece of labelled) {
      const previous = merged.at(-1);
      if (previous?.sentenceId === piece.sentenceId) {
        previous.nodes.push(...piece.nodes);
      } else {
        merged.push({ sentenceId: piece.sentenceId, nodes: [...piece.nodes] });
      }
    }
    return merged;
  }

  private static removeStaleMarkers(document: Document): void {
    const clean = (nodes: ChildNode[]): ChildNode[] =>
      nodes.flatMap((node) => {
        if (!isTag(node)) return [node];
        const hadSentenceMarker = SENTENCE_MARKER_ATTRIBUTE in node.attribs;
        const hadTermMarker = TERM_MARKER_ATTRIBUTE in node.attribs;
        delete node.attribs[SENTENCE_MARKER_ATTRIBUTE];
        delete node.attribs[TERM_MARKER_ATTRIBUTE];
        this.setChildren(node, clean(node.children));
        if (
          node.name === SENTENCE_MARKER_TAG &&
          (hadSentenceMarker || hadTermMarker) &&
          Object.keys(node.attribs).length === 0
        ) {
          return node.children;
        }
        return [node];
      });

    this.setChildren(document, clean(document.children));
  }

  private static setChildren(parent: ParentNode, children: ChildNode[]): void {
    parent.children = children;
    children.forEach((child, index) => {
      child.parent = parent;
      child.prev = children[index - 1] ?? null;
      child.next = children[index + 1] ?? null;
    });
  }
}
