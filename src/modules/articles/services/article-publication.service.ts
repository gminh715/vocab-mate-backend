import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DomUtils, parseDocument } from 'htmlparser2';
import { type ChildNode, Element, isTag } from 'domhandler';
import { ArticleStatus, CefrLevel } from '../../../../generated/prisma/enums';
import { isCefrAtOrAbove } from '../../../common/utils/cefr-level.util';
import type { PublicationValidationIssueDto } from '../dto/article-publication.dto';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import {
  ArticleStatusTransitionConflictError,
  type ArticlePublicationSnapshot,
  type ArticleSentenceTermRecord,
  ArticlesRepository,
} from '../repositories/articles.repository';

const SENTENCE_MARKER_ATTRIBUTE = 'data-sentence-id';
const TERM_MARKER_ATTRIBUTE = 'data-term-id';
const MINIMUM_LOOKUP_TERM_COUNT = 1;
interface SentenceMarker {
  id: string;
  text: string;
}

interface TermMarker {
  id: string;
  sentenceId: string | null;
  text: string;
}

interface MarkerInventory {
  sentences: SentenceMarker[];
  terms: TermMarker[];
  issues: PublicationValidationIssueDto[];
}

@Injectable()
export class ArticlePublicationService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}

  async publish(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.PUBLISHED) {
      throw new ConflictException('Article is already published');
    }
    if (snapshot.article.status !== ArticleStatus.DRAFT) {
      throw new ConflictException('Only a draft article can be published');
    }

    const issues = this.validateForPublication(snapshot);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Article failed publication validation',
        issues,
      });
    }

    const publishedAt = new Date();
    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: ArticleStatus.DRAFT,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        requireActiveCategory: true,
        status: ArticleStatus.PUBLISHED,
        publishedAt,
        archivedAt: null,
        updatedByUserId: actingAdminId,
      });
      if (!article.publishedAt) {
        throw new ArticleStatusTransitionConflictError();
      }
      return {
        id: article.id,
        status: article.status,
        publishedAt: article.publishedAt,
      };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async archive(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Article is already archived');
    }
    if (
      snapshot.article.status !== ArticleStatus.DRAFT &&
      snapshot.article.status !== ArticleStatus.PUBLISHED
    ) {
      throw new ConflictException('Article cannot be archived from this state');
    }

    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: snapshot.article.status,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        status: ArticleStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedByUserId: actingAdminId,
      });
      if (!article.archivedAt) {
        throw new ArticleStatusTransitionConflictError();
      }
      return {
        id: article.id,
        status: article.status,
        archivedAt: article.archivedAt,
      };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async restoreDraft(actingAdminId: string, articleId: string) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status !== ArticleStatus.ARCHIVED) {
      throw new ConflictException('Only an archived article can be restored');
    }

    try {
      const article = await this.articlesRepository.transitionArticleStatus({
        articleId,
        expectedStatus: ArticleStatus.ARCHIVED,
        expectedContentVersion: snapshot.article.contentVersion,
        expectedContentHtml: snapshot.article.contentHtml,
        status: ArticleStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        updatedByUserId: actingAdminId,
      });
      return { id: article.id, status: article.status };
    } catch (error: unknown) {
      this.mapTransitionError(error);
    }
  }

  async preview(articleId: string, selectedCefrLevel?: CefrLevel) {
    const snapshot = await this.requireSnapshot(articleId);
    if (snapshot.article.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived articles cannot be previewed');
    }

    const previewLevel = selectedCefrLevel ?? snapshot.article.cefrLevel;
    const {
      contentHtml,
      archivedAt: _archivedAt,
      categoryId: _categoryId,
      category,
      ...article
    } = snapshot.article;
    void _archivedAt;
    void _categoryId;

    const terms = snapshot.sentences.flatMap((sentence) =>
      sentence.isActive
        ? sentence.terms
            .filter((term) => term.isActive && term.isLookupEnabled)
            .map((term) => ({
              ...term,
              isHighlighted: isCefrAtOrAbove(term.cefrLevel, previewLevel),
            }))
        : [],
    );

    return {
      article: {
        ...article,
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
        },
      },
      contentHtml: HtmlSanitizerHelper.sanitize(contentHtml),
      terms,
      validationWarnings: this.validateForPublication(snapshot),
    };
  }

  validateForPublication(
    snapshot: ArticlePublicationSnapshot,
  ): PublicationValidationIssueDto[] {
    const issues: PublicationValidationIssueDto[] = [];
    const addIssue = (
      code: string,
      message: string,
      entityId?: string,
    ): void => {
      issues.push({
        code,
        message,
        ...(entityId ? { entityId } : {}),
      });
    };
    const article = snapshot.article;
    const requiredArticleFields = [
      ['title', article.title],
      ['slug', article.slug],
      ['summary', article.summary],
    ] as const;
    for (const [field, value] of requiredArticleFields) {
      if (!value.trim()) {
        addIssue(
          'ARTICLE_METADATA_INCOMPLETE',
          `Article ${field} must not be blank.`,
          article.id,
        );
      }
    }
    if (!article.category.isActive) {
      addIssue(
        'INACTIVE_CATEGORY',
        'The article category must be active.',
        article.category.id,
      );
    }

    const sanitizedHtml = HtmlSanitizerHelper.sanitize(article.contentHtml);
    if (!sanitizedHtml || !/<[a-z][\s\S]*>/iu.test(sanitizedHtml)) {
      addIssue(
        'INVALID_CONTENT_HTML',
        'Article content must contain supported non-empty HTML.',
        article.id,
      );
    } else if (sanitizedHtml !== article.contentHtml) {
      addIssue(
        'UNSANITIZED_CONTENT_HTML',
        'Article content contains markup outside the HTML allowlist.',
        article.id,
      );
    }

    if (snapshot.sentences.length === 0) {
      addIssue(
        'MISSING_PARSE',
        'The current content version has not been parsed.',
        article.id,
      );
    }
    const activeSentences = snapshot.sentences.filter(
      (sentence) => sentence.isActive,
    );
    if (snapshot.sentences.length > 0 && activeSentences.length === 0) {
      addIssue(
        'NO_ACTIVE_SENTENCES',
        'At least one current-version sentence must be active.',
        article.id,
      );
    }

    const inventory = this.collectMarkers(article.contentHtml);
    issues.push(...inventory.issues);
    const sentenceRows = new Map(
      snapshot.sentences.map((sentence) => [sentence.id, sentence]),
    );
    const activeSentenceRows = new Map(
      activeSentences.map((sentence) => [sentence.id, sentence]),
    );
    const sentenceMarkers = this.groupById(inventory.sentences);

    for (const [markerId, markers] of sentenceMarkers) {
      const row = sentenceRows.get(markerId);
      if (!row) {
        addIssue(
          'ORPHAN_SENTENCE_MARKER',
          'A sentence marker does not map to the current content version.',
          markerId,
        );
        continue;
      }
      if (!row.isActive) {
        addIssue(
          'INACTIVE_SENTENCE_MARKER',
          'An inactive sentence still has a publication marker.',
          markerId,
        );
      }
      if (markers.length > 1) {
        addIssue(
          'DUPLICATE_SENTENCE_MARKER',
          'A sentence marker ID occurs more than once.',
          markerId,
        );
      }
      if (
        markers.some(
          (marker) =>
            this.normalizeText(marker.text) !==
            this.normalizeText(row.sentenceText),
        )
      ) {
        addIssue(
          'SENTENCE_TEXT_MISMATCH',
          'Sentence marker text does not match the current sentence row.',
          markerId,
        );
      }
    }
    for (const sentence of activeSentenceRows.values()) {
      if (!sentenceMarkers.has(sentence.id)) {
        addIssue(
          'MISSING_SENTENCE_MARKER',
          'An active current-version sentence has no HTML marker.',
          sentence.id,
        );
      }
    }

    const allTerms = new Map<string, ArticleSentenceTermRecord>();
    const activeLookupTerms = new Map<string, ArticleSentenceTermRecord>();
    for (const sentence of snapshot.sentences) {
      for (const term of sentence.terms) {
        allTerms.set(term.id, term);
        if (sentence.isActive && term.isActive && term.isLookupEnabled) {
          activeLookupTerms.set(term.id, term);
          if (!this.hasRequiredTermMetadata(term)) {
            addIssue(
              'TERM_METADATA_INCOMPLETE',
              'An active lookup term is missing required vocabulary metadata.',
              term.id,
            );
          }
        }
      }
    }
    if (activeLookupTerms.size < MINIMUM_LOOKUP_TERM_COUNT) {
      addIssue(
        'MINIMUM_TERMS_NOT_MET',
        `At least ${MINIMUM_LOOKUP_TERM_COUNT} active lookup term is required.`,
        article.id,
      );
    }

    const termMarkers = this.groupById(inventory.terms);
    for (const marker of inventory.terms) {
      const term = allTerms.get(marker.id);
      if (!term) {
        addIssue(
          'ORPHAN_TERM_MARKER',
          'A term marker does not map to a current-version term.',
          marker.id,
        );
        continue;
      }
      const sentence = sentenceRows.get(term.sentenceId);
      if (!sentence || marker.sentenceId !== term.sentenceId) {
        addIssue(
          'TERM_SENTENCE_MISMATCH',
          'A term marker is outside its owning current-version sentence.',
          term.id,
        );
      }
      if (!sentence?.isActive || !term.isActive || !term.isLookupEnabled) {
        addIssue(
          'INACTIVE_TERM_MARKER',
          'A publication marker maps to an inactive or disabled term.',
          term.id,
        );
      }
      if (
        this.normalizeText(marker.text).toLocaleLowerCase('en-US') !==
        this.normalizeText(term.value).toLocaleLowerCase('en-US')
      ) {
        addIssue(
          'TERM_MARKER_TEXT_MISMATCH',
          'Term marker text does not match its vocabulary value.',
          term.id,
        );
      }
    }
    for (const term of activeLookupTerms.values()) {
      if (!termMarkers.has(term.id)) {
        addIssue(
          'MISSING_TERM_MARKER',
          'An active lookup term has no HTML marker.',
          term.id,
        );
      }
    }

    return this.deduplicateIssues(issues);
  }

  private async requireSnapshot(
    articleId: string,
  ): Promise<ArticlePublicationSnapshot> {
    const snapshot =
      await this.articlesRepository.findPublicationSnapshot(articleId);
    if (!snapshot) throw new NotFoundException('Article not found');
    return snapshot;
  }

  private collectMarkers(contentHtml: string): MarkerInventory {
    const document = parseDocument(contentHtml, { decodeEntities: true });
    const sentences: SentenceMarker[] = [];
    const terms: TermMarker[] = [];
    const issues: PublicationValidationIssueDto[] = [];

    const visit = (
      nodes: ChildNode[],
      sentenceId: string | null,
      termId: string | null,
    ): void => {
      for (const node of nodes) {
        if (!isTag(node)) continue;
        let currentSentenceId = sentenceId;
        let currentTermId = termId;
        if (SENTENCE_MARKER_ATTRIBUTE in node.attribs) {
          const id = node.attribs[SENTENCE_MARKER_ATTRIBUTE];
          if (sentenceId) {
            issues.push({
              code: 'NESTED_SENTENCE_MARKER',
              message: 'Sentence markers must not be nested.',
              ...(id ? { entityId: id } : {}),
            });
          }
          if (node.name !== 'span' || !id) {
            issues.push({
              code: 'INVALID_SENTENCE_MARKER',
              message: 'Sentence markers must be non-empty span attributes.',
              ...(id ? { entityId: id } : {}),
            });
          }
          if (id) {
            sentences.push({ id, text: DomUtils.textContent(node) });
            currentSentenceId = id;
          }
        }
        if (TERM_MARKER_ATTRIBUTE in node.attribs) {
          const id = node.attribs[TERM_MARKER_ATTRIBUTE];
          if (termId) {
            issues.push({
              code: 'NESTED_TERM_MARKER',
              message: 'Term markers must not overlap or be nested.',
              ...(id ? { entityId: id } : {}),
            });
          }
          if (node.name !== 'span' || !id) {
            issues.push({
              code: 'INVALID_TERM_MARKER',
              message: 'Term markers must be non-empty span attributes.',
              ...(id ? { entityId: id } : {}),
            });
          }
          if (id) {
            terms.push({
              id,
              sentenceId: currentSentenceId,
              text: DomUtils.textContent(node),
            });
            currentTermId = id;
          }
        }
        visit(node.children, currentSentenceId, currentTermId);
      }
    };
    visit(document.children, null, null);
    return { sentences, terms, issues };
  }

  private groupById<T extends { id: string }>(items: T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const values = groups.get(item.id) ?? [];
      values.push(item);
      groups.set(item.id, values);
    }
    return groups;
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
  }

  private hasRequiredTermMetadata(term: ArticleSentenceTermRecord): boolean {
    return [
      term.value,
      term.wordDisplay,
      term.lemma,
      term.normalizedLemma,
      term.partOfSpeech,
      term.contextualMeaningVi,
    ].every((value) => value.trim().length > 0);
  }

  private deduplicateIssues(
    issues: PublicationValidationIssueDto[],
  ): PublicationValidationIssueDto[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      const key = `${issue.code}:${issue.entityId ?? ''}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private mapTransitionError(error: unknown): never {
    if (error instanceof ArticleStatusTransitionConflictError) {
      throw new ConflictException(
        'Article state or content changed; retry the request',
      );
    }
    throw error;
  }
}
