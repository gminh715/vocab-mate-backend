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

const SENTENCE_MARKER_ATTRIBUTE = 'data-sentence-id';
const TERM_MARKER_ATTRIBUTE = 'data-term-id';
const MARKER_TAG = 'span';
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_]/u;

export type TermMarkerUnitType = 'WORD' | 'PHRASE';

export class SentenceMarkerNotFoundError extends Error {}
export class TermMarkerNotFoundError extends Error {}
export class TermValueNotFoundError extends Error {}
export class TermMarkerConflictError extends Error {}

interface TextMap {
  text: string;
  offsets: WeakMap<ChildNode, { start: number; end: number }>;
  elementOffsets: WeakMap<Element, { start: number; end: number }>;
}

interface MatchRange {
  index: number;
  start: number;
  end: number;
}

interface LabelledNodes {
  matchIndex: number | null;
  nodes: ChildNode[];
}

export class TermMarkerHelper {
  static matchesText(
    sentenceText: string,
    value: string,
    unitType: TermMarkerUnitType,
  ): boolean {
    return this.findMatches(sentenceText, value, unitType).length > 0;
  }

  static insert(
    contentHtml: string,
    sentenceId: string,
    termId: string,
    value: string,
    unitType: TermMarkerUnitType,
  ): string {
    const document = parseDocument(contentHtml, { decodeEntities: true });
    const sentence = this.requireSentence(document, sentenceId);
    this.assertValidMarkerTree(document, sentence, termId, false);
    const textMap = this.buildTextMap(sentence);
    const matches = this.findMatches(textMap.text, value, unitType);
    if (matches.length === 0) throw new TermValueNotFoundError();
    this.assertNoOverlap(sentence, textMap, matches);
    this.annotate(sentence, textMap, matches, termId);
    return DomUtils.getInnerHTML(document);
  }

  static replace(
    contentHtml: string,
    sentenceId: string,
    termId: string,
    value: string,
    unitType: TermMarkerUnitType,
  ): string {
    const withoutOldMarker = this.unwrap(contentHtml, sentenceId, termId);
    return this.insert(withoutOldMarker, sentenceId, termId, value, unitType);
  }

  static unwrap(
    contentHtml: string,
    sentenceId: string,
    termId: string,
  ): string {
    const document = parseDocument(contentHtml, { decodeEntities: true });
    const sentence = this.requireSentence(document, sentenceId);
    const targetMarkers = this.assertValidMarkerTree(
      document,
      sentence,
      termId,
      true,
    );
    if (targetMarkers.length === 0) throw new TermMarkerNotFoundError();

    const clean = (nodes: ChildNode[]): ChildNode[] =>
      nodes.flatMap((node) => {
        if (!isTag(node)) return [node.cloneNode(true)];
        const children = clean(node.children);
        if (node.attribs[TERM_MARKER_ATTRIBUTE] !== termId) {
          const clone = node.cloneNode(false);
          this.setChildren(clone, children);
          return [clone];
        }

        const remainingAttributes = { ...node.attribs };
        delete remainingAttributes[TERM_MARKER_ATTRIBUTE];
        if (
          node.name === MARKER_TAG &&
          Object.keys(remainingAttributes).length === 0
        ) {
          return children;
        }
        const clone = new Element(
          node.name,
          remainingAttributes,
          [],
          node.type,
        );
        this.setChildren(clone, children);
        return [clone];
      });

    this.setChildren(sentence, clean(sentence.children));
    this.mergeEquivalentAdjacentElements(sentence);
    return DomUtils.getInnerHTML(document);
  }

  static assertMarker(
    contentHtml: string,
    sentenceId: string,
    termId: string,
  ): void {
    const document = parseDocument(contentHtml, { decodeEntities: true });
    const sentence = this.requireSentence(document, sentenceId);
    const markers = this.assertValidMarkerTree(
      document,
      sentence,
      termId,
      true,
    );
    if (markers.length === 0) throw new TermMarkerNotFoundError();
  }

  private static requireSentence(
    document: Document,
    sentenceId: string,
  ): Element {
    const sentences = this.findElements(
      document.children,
      (element) => element.attribs[SENTENCE_MARKER_ATTRIBUTE] === sentenceId,
    );
    if (sentences.length === 0) throw new SentenceMarkerNotFoundError();
    if (sentences.length > 1) throw new TermMarkerConflictError();
    return sentences[0];
  }

  private static assertValidMarkerTree(
    document: Document,
    sentence: Element,
    targetTermId: string,
    allowTarget: boolean,
  ): Element[] {
    const allTargetMarkers = this.findElements(
      document.children,
      (element) => element.attribs[TERM_MARKER_ATTRIBUTE] === targetTermId,
    );
    const sentenceMarkers = this.findElements(
      sentence.children,
      (element) => TERM_MARKER_ATTRIBUTE in element.attribs,
    );
    const targetMarkers = sentenceMarkers.filter(
      (element) => element.attribs[TERM_MARKER_ATTRIBUTE] === targetTermId,
    );

    if (
      (!allowTarget && allTargetMarkers.length > 0) ||
      allTargetMarkers.length !== targetMarkers.length
    ) {
      throw new TermMarkerConflictError();
    }
    for (const marker of sentenceMarkers) {
      let ancestor = marker.parent;
      while (ancestor && ancestor !== sentence) {
        if (isTag(ancestor) && TERM_MARKER_ATTRIBUTE in ancestor.attribs) {
          throw new TermMarkerConflictError();
        }
        ancestor = ancestor.parent;
      }
    }
    return targetMarkers;
  }

  private static buildTextMap(sentence: Element): TextMap {
    const offsets = new WeakMap<ChildNode, { start: number; end: number }>();
    const elementOffsets = new WeakMap<
      Element,
      { start: number; end: number }
    >();
    let text = '';

    const visit = (nodes: ChildNode[]): void => {
      for (const node of nodes) {
        if (isText(node)) {
          const start = text.length;
          text += node.data;
          offsets.set(node, { start, end: text.length });
          continue;
        }
        if (!isTag(node)) continue;
        const start = text.length;
        if (node.name === 'br') {
          text += '\n';
          offsets.set(node, { start, end: text.length });
        } else {
          visit(node.children);
        }
        elementOffsets.set(node, { start, end: text.length });
      }
    };

    visit(sentence.children);
    return { text, offsets, elementOffsets };
  }

  private static findMatches(
    text: string,
    value: string,
    unitType: TermMarkerUnitType,
  ): MatchRange[] {
    if (value.length === 0) return [];
    const normalizedText = text.toLocaleLowerCase('en-US');
    const normalizedValue = value.toLocaleLowerCase('en-US');
    const matches: MatchRange[] = [];
    let cursor = 0;

    while (cursor <= normalizedText.length - normalizedValue.length) {
      const start = normalizedText.indexOf(normalizedValue, cursor);
      if (start < 0) break;
      const end = start + normalizedValue.length;
      const hasWordBoundary =
        unitType === 'PHRASE' ||
        (!this.isWordCharacter(text[start - 1]) &&
          !this.isWordCharacter(text[end]));
      if (hasWordBoundary) {
        matches.push({ index: matches.length, start, end });
      }
      cursor = start + Math.max(normalizedValue.length, 1);
    }
    return matches;
  }

  private static isWordCharacter(value: string | undefined): boolean {
    return value !== undefined && WORD_CHARACTER.test(value);
  }

  private static assertNoOverlap(
    sentence: Element,
    textMap: TextMap,
    matches: MatchRange[],
  ): void {
    const markerRanges = this.findElements(
      sentence.children,
      (element) => TERM_MARKER_ATTRIBUTE in element.attribs,
    ).map((element) => textMap.elementOffsets.get(element));

    if (
      markerRanges.some(
        (marker) =>
          marker &&
          matches.some(
            (match) => match.start < marker.end && match.end > marker.start,
          ),
      )
    ) {
      throw new TermMarkerConflictError();
    }
  }

  private static annotate(
    sentence: Element,
    textMap: TextMap,
    matches: MatchRange[],
    termId: string,
  ): void {
    const pieces = this.mergePieces(
      sentence.children.flatMap((node) =>
        this.partitionNode(node, textMap, matches),
      ),
    );
    const children = pieces.flatMap(({ matchIndex, nodes }) => {
      if (matchIndex === null) return nodes;
      return [
        new Element(MARKER_TAG, { [TERM_MARKER_ATTRIBUTE]: termId }, nodes),
      ];
    });
    this.setChildren(sentence, children);
  }

  private static partitionNode(
    node: ChildNode,
    textMap: TextMap,
    matches: MatchRange[],
  ): LabelledNodes[] {
    const offset = textMap.offsets.get(node);
    if (isText(node) && offset) {
      const boundaries = new Set([offset.start, offset.end]);
      for (const match of matches) {
        if (match.start > offset.start && match.start < offset.end) {
          boundaries.add(match.start);
        }
        if (match.end > offset.start && match.end < offset.end) {
          boundaries.add(match.end);
        }
      }
      const sorted = [...boundaries].sort((left, right) => left - right);
      return sorted.slice(0, -1).map((start, index) => {
        const end = sorted[index + 1];
        return {
          matchIndex: this.matchAt(matches, start, end),
          nodes: [
            new Text(node.data.slice(start - offset.start, end - offset.start)),
          ],
        };
      });
    }

    if (!isTag(node)) {
      return [{ matchIndex: null, nodes: [node.cloneNode(true)] }];
    }
    if (node.name === 'br') {
      return [
        {
          matchIndex: offset
            ? this.matchAt(matches, offset.start, offset.end)
            : null,
          nodes: [node.cloneNode(true)],
        },
      ];
    }

    const childPieces = this.mergePieces(
      node.children.flatMap((child) =>
        this.partitionNode(child, textMap, matches),
      ),
    );
    if (childPieces.length === 0) {
      return [{ matchIndex: null, nodes: [node.cloneNode(true)] }];
    }
    return childPieces.map(({ matchIndex, nodes }) => {
      const clone = node.cloneNode(false);
      this.setChildren(clone, nodes);
      return { matchIndex, nodes: [clone] };
    });
  }

  private static matchAt(
    matches: MatchRange[],
    start: number,
    end: number,
  ): number | null {
    return (
      matches.find((match) => start >= match.start && end <= match.end)
        ?.index ?? null
    );
  }

  private static mergePieces(pieces: LabelledNodes[]): LabelledNodes[] {
    const merged: LabelledNodes[] = [];
    for (const piece of pieces) {
      const previous = merged.at(-1);
      if (previous?.matchIndex === piece.matchIndex) {
        previous.nodes.push(...piece.nodes);
      } else {
        merged.push({ matchIndex: piece.matchIndex, nodes: [...piece.nodes] });
      }
    }
    return merged;
  }

  private static findElements(
    nodes: ChildNode[],
    predicate: (element: Element) => boolean,
  ): Element[] {
    const elements: Element[] = [];
    for (const node of nodes) {
      if (!isTag(node)) continue;
      if (predicate(node)) elements.push(node);
      elements.push(...this.findElements(node.children, predicate));
    }
    return elements;
  }

  private static mergeEquivalentAdjacentElements(parent: ParentNode): void {
    for (const child of parent.children) {
      if (isTag(child)) this.mergeEquivalentAdjacentElements(child);
    }
    const merged: ChildNode[] = [];
    for (const child of parent.children) {
      const previous = merged.at(-1);
      if (
        previous &&
        isTag(previous) &&
        isTag(child) &&
        previous.name === child.name &&
        JSON.stringify(previous.attribs) === JSON.stringify(child.attribs)
      ) {
        this.setChildren(previous, [...previous.children, ...child.children]);
      } else {
        merged.push(child);
      }
    }
    this.setChildren(parent, merged);
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
