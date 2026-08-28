import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ArticleStatus,
  TermOrigin,
  TermReviewStatus,
} from '../../../../generated/prisma/enums';
import {
  ArticleTermListQueryDto,
  CreateArticleTermDto,
  UpdateArticleTermDto,
} from '../dto/article-term.dto';
import {
  SentenceMarkerNotFoundError,
  TermMarkerConflictError,
  TermMarkerHelper,
  TermMarkerNotFoundError,
  TermValueNotFoundError,
} from '../helpers/term-marker.helper';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  type CreateArticleTermInput,
  type UpdateArticleTermInput,
  ArticleTermsRepository,
} from '../repositories/article-terms.repository';

const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class ArticleTermsService {
  constructor(
    private readonly articleTermsRepository: ArticleTermsRepository,
  ) {}

  async create(
    actingAdminId: string,
    articleId: string,
    sentenceId: string,
    dto: CreateArticleTermDto,
  ) {
    void actingAdminId;
    const context = await this.articleTermsRepository.findSentenceTermContext(
      articleId,
      sentenceId,
    );
    if (!context) throw new NotFoundException('Sentence not found');
    this.requireMutableArticle(context.article.status);
    if (!context.sentence.isActive) {
      throw new ConflictException(
        'Terms cannot be added to an inactive sentence',
      );
    }
    this.requireTextMatch(context.sentence.sentenceText, dto.value);

    const termId = randomUUID();
    let updatedContentHtml: string;
    try {
      updatedContentHtml = HtmlSanitizerHelper.sanitize(
        TermMarkerHelper.insert(
          context.article.contentHtml,
          sentenceId,
          termId,
          dto.value,
        ),
      );
    } catch (error: unknown) {
      this.mapMarkerError(error);
    }

    try {
      const term = await this.articleTermsRepository.createTermWithMarker(
        {
          articleId,
          sentenceId,
          termId,
          contentVersion: context.article.contentVersion,
          sourceContentHtml: context.article.contentHtml,
          updatedContentHtml,
        },
        this.toCreateInput(sentenceId, termId, dto),
      );
      return { term, updatedContentHtml };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async findAll(articleId: string, query: ArticleTermListQueryDto) {
    const result = await this.articleTermsRepository.findTerms(articleId, {
      page: query.page,
      limit: query.limit,
      ...(query.sentenceId ? { sentenceId: query.sentenceId } : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.explanationStatus
        ? { explanationStatus: query.explanationStatus }
        : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q ? { q: query.q.trim() } : {}),
    });
    if (!result) throw new NotFoundException('Article not found');
    return {
      items: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
      contentVersion: result.contentVersion,
    };
  }

  async findOne(articleId: string, termId: string) {
    const detail = await this.articleTermsRepository.findTermDetail(
      articleId,
      termId,
    );
    if (!detail) throw new NotFoundException('Term not found');
    return detail;
  }

  async update(
    actingAdminId: string,
    articleId: string,
    termId: string,
    dto: UpdateArticleTermDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one term field is required');
    }
    const context = await this.articleTermsRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireMutableArticle(context.article.status);

    const nextValue = dto.value ?? context.term.value;
    const markerShapeRequested = dto.value !== undefined;
    let updatedContentHtml = context.article.contentHtml;
    const hasApprovedMarker =
      context.term.reviewStatus === TermReviewStatus.APPROVED;
    const hasSingleOccurrenceMarker = context.term.origin !== TermOrigin.MANUAL;

    if (
      !hasApprovedMarker &&
      (dto.isActive === true || dto.isLookupEnabled === true)
    ) {
      throw new ConflictException(
        'Pending or rejected AI terms must be approved through the moderation endpoint',
      );
    }

    try {
      if (hasApprovedMarker) {
        if (hasSingleOccurrenceMarker) {
          TermMarkerHelper.assertSingleMarker(
            context.article.contentHtml,
            context.sentence.id,
            termId,
          );
        } else {
          TermMarkerHelper.assertMarker(
            context.article.contentHtml,
            context.sentence.id,
            termId,
          );
        }
      }
      if (markerShapeRequested && hasApprovedMarker) {
        if (!context.sentence.isActive) {
          throw new ConflictException(
            'Term markers cannot be changed in an inactive sentence',
          );
        }
        this.requireTextMatch(context.sentence.sentenceText, nextValue);
        const replaceMarker = hasSingleOccurrenceMarker
          ? TermMarkerHelper.replaceFirst.bind(TermMarkerHelper)
          : TermMarkerHelper.replace.bind(TermMarkerHelper);
        updatedContentHtml = HtmlSanitizerHelper.sanitize(
          replaceMarker(
            context.article.contentHtml,
            context.sentence.id,
            termId,
            nextValue,
          ),
        );
      } else if (markerShapeRequested) {
        if (!context.sentence.isActive) {
          throw new ConflictException(
            'Terms cannot be changed in an inactive sentence',
          );
        }
        this.requireTextMatch(context.sentence.sentenceText, nextValue);
      }
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.mapMarkerError(error);
    }

    const contentHtmlChanged =
      updatedContentHtml !== context.article.contentHtml;
    void actingAdminId;
    const input = this.toUpdateInput(dto);
    try {
      const term = contentHtmlChanged
        ? await this.articleTermsRepository.updateTermWithMarker(
            {
              articleId,
              sentenceId: context.sentence.id,
              termId,
              contentVersion: context.article.contentVersion,
              sourceContentHtml: context.article.contentHtml,
              updatedContentHtml,
            },
            input,
          )
        : await this.articleTermsRepository.updateTermMetadata(
            articleId,
            context.article.contentVersion,
            termId,
            input,
          );
      if (!term) throw new ArticleTermStateConflictError();
      return { term, contentHtmlChanged };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async approveAiCandidate(
    actingAdminId: string,
    articleId: string,
    termId: string,
  ) {
    const context = await this.articleTermsRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireDraftModeration(context.article.status);
    if (context.term.origin !== TermOrigin.AI) {
      throw new ConflictException('Only AI term candidates can be approved');
    }
    if (!context.sentence.isActive) {
      throw new ConflictException(
        'Terms cannot be approved in an inactive sentence',
      );
    }

    if (context.term.reviewStatus === TermReviewStatus.APPROVED) {
      if (!context.term.isActive || !context.term.isLookupEnabled) {
        throw new ConflictException(
          'Approved AI term state is inconsistent; retry after correction',
        );
      }
      try {
        TermMarkerHelper.assertSingleMarker(
          context.article.contentHtml,
          context.sentence.id,
          termId,
        );
      } catch (error: unknown) {
        this.mapMarkerError(error);
      }
      return { term: context.term, contentHtmlChanged: false };
    }
    if (context.term.reviewStatus !== TermReviewStatus.PENDING) {
      throw new ConflictException(
        'Rejected AI term candidates cannot be approved',
      );
    }
    this.requireTextMatch(context.sentence.sentenceText, context.term.value);

    let updatedContentHtml: string;
    try {
      updatedContentHtml = HtmlSanitizerHelper.sanitize(
        TermMarkerHelper.insertFirst(
          context.article.contentHtml,
          context.sentence.id,
          termId,
          context.term.value,
        ),
      );
    } catch (error: unknown) {
      this.mapMarkerError(error);
    }

    try {
      const term = await this.articleTermsRepository.approveAiTermWithMarker({
        articleId,
        sentenceId: context.sentence.id,
        termId,
        contentVersion: context.article.contentVersion,
        sourceContentHtml: context.article.contentHtml,
        updatedContentHtml,
      });
      return { term, contentHtmlChanged: true };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async rejectAiCandidate(
    actingAdminId: string,
    articleId: string,
    termId: string,
  ) {
    const context = await this.articleTermsRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireDraftModeration(context.article.status);
    if (context.term.origin !== TermOrigin.AI) {
      throw new ConflictException('Only AI term candidates can be rejected');
    }

    if (context.term.reviewStatus === TermReviewStatus.REJECTED) {
      if (context.term.isActive || context.term.isLookupEnabled) {
        throw new ConflictException(
          'Rejected AI term state is inconsistent; retry after correction',
        );
      }
      return { term: context.term, contentHtmlChanged: false };
    }
    if (context.term.reviewStatus !== TermReviewStatus.PENDING) {
      throw new ConflictException(
        'Approved AI term candidates cannot be rejected',
      );
    }

    try {
      const term = await this.articleTermsRepository.rejectAiTerm(
        articleId,
        context.article.contentVersion,
        termId,
      );
      return { term, contentHtmlChanged: false };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async delete(
    actingAdminId: string,
    articleId: string,
    termId: string,
  ): Promise<void> {
    void actingAdminId;
    const context = await this.articleTermsRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireMutableArticle(context.article.status);

    let updatedContentHtml: string;
    try {
      updatedContentHtml = HtmlSanitizerHelper.sanitize(
        TermMarkerHelper.unwrap(
          context.article.contentHtml,
          context.sentence.id,
          termId,
        ),
      );
    } catch (error: unknown) {
      this.mapMarkerError(error);
    }

    try {
      await this.articleTermsRepository.deleteTermWithMarker({
        articleId,
        sentenceId: context.sentence.id,
        termId,
        contentVersion: context.article.contentVersion,
        sourceContentHtml: context.article.contentHtml,
        updatedContentHtml,
      });
    } catch (error: unknown) {
      if (
        error instanceof ArticleTermReferencedError ||
        hasPrismaCode(error, 'P2003')
      ) {
        throw new ConflictException(
          'Term is referenced by saved vocabulary and cannot be deleted',
        );
      }
      this.mapWriteError(error);
    }
  }

  private requireMutableArticle(status: ArticleStatus): void {
    if (status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived article terms cannot be changed');
    }
  }

  private requireDraftModeration(status: ArticleStatus): void {
    if (status !== ArticleStatus.DRAFT) {
      throw new ConflictException(
        'AI term candidates can only be moderated on draft articles',
      );
    }
  }

  private requireTextMatch(sentenceText: string, value: string): void {
    if (!TermMarkerHelper.matchesText(sentenceText, value)) {
      throw new UnprocessableEntityException(
        'Term value does not match the selected sentence',
      );
    }
  }

  private toCreateInput(
    sentenceId: string,
    termId: string,
    dto: CreateArticleTermDto,
  ): CreateArticleTermInput {
    return {
      id: termId,
      sentenceId,
      value: dto.value,
      lemma: dto.lemma,
      partOfSpeech: dto.partOfSpeech.toLocaleLowerCase('en-US'),
      ...(dto.ipa === undefined ? {} : { ipa: dto.ipa }),
      cefrLevel: dto.cefrLevel,
      contextualMeaningVi: dto.contextualMeaningVi,
      ...(dto.definitionEn === undefined
        ? {}
        : { definitionEn: dto.definitionEn }),
      ...(dto.contextualExplanation === undefined
        ? {}
        : { contextualExplanation: dto.contextualExplanation }),
      synonyms: dto.synonyms ?? [],
      antonyms: dto.antonyms ?? [],
      collocations: dto.collocations ?? [],
      relatedTerms: dto.relatedTerms ?? [],
      examples: (dto.examples ?? []).map(({ sentence, translationVi }) => ({
        sentence,
        translationVi,
      })),
      isLookupEnabled: dto.isLookupEnabled ?? true,
      isActive: dto.isActive ?? true,
    };
  }

  private toUpdateInput(dto: UpdateArticleTermDto): UpdateArticleTermInput {
    return {
      ...(dto.value === undefined ? {} : { value: dto.value }),
      ...(dto.lemma === undefined ? {} : { lemma: dto.lemma }),
      ...(dto.partOfSpeech === undefined
        ? {}
        : {
            partOfSpeech: dto.partOfSpeech.toLocaleLowerCase('en-US'),
          }),
      ...(dto.ipa === undefined ? {} : { ipa: dto.ipa }),
      ...(dto.cefrLevel === undefined ? {} : { cefrLevel: dto.cefrLevel }),
      ...(dto.contextualMeaningVi === undefined
        ? {}
        : { contextualMeaningVi: dto.contextualMeaningVi }),
      ...(dto.definitionEn === undefined
        ? {}
        : { definitionEn: dto.definitionEn }),
      ...(dto.contextualExplanation === undefined
        ? {}
        : { contextualExplanation: dto.contextualExplanation }),
      ...(dto.synonyms === undefined ? {} : { synonyms: dto.synonyms }),
      ...(dto.antonyms === undefined ? {} : { antonyms: dto.antonyms }),
      ...(dto.collocations === undefined
        ? {}
        : { collocations: dto.collocations }),
      ...(dto.relatedTerms === undefined
        ? {}
        : { relatedTerms: dto.relatedTerms }),
      ...(dto.examples === undefined
        ? {}
        : {
            examples: dto.examples.map(({ sentence, translationVi }) => ({
              sentence,
              translationVi,
            })),
          }),
      ...(dto.isLookupEnabled === undefined
        ? {}
        : { isLookupEnabled: dto.isLookupEnabled }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    };
  }

  private mapMarkerError(error: unknown): never {
    if (error instanceof TermValueNotFoundError) {
      throw new UnprocessableEntityException(
        'Term value does not match the selected sentence HTML',
      );
    }
    if (
      error instanceof SentenceMarkerNotFoundError ||
      error instanceof TermMarkerNotFoundError ||
      error instanceof TermMarkerConflictError
    ) {
      throw new ConflictException(
        'Article term markers are missing, duplicated, nested, or overlapping',
      );
    }
    throw error;
  }

  private mapWriteError(error: unknown): never {
    if (error instanceof ArticleTermStateConflictError) {
      throw new ConflictException(
        'Article content or sentence state changed; retry the request',
      );
    }
    if (hasPrismaCode(error, 'P2002')) {
      throw new ConflictException(
        'A matching term already exists in this sentence',
      );
    }
    if (hasPrismaCode(error, 'P2025')) {
      throw new NotFoundException('Term not found');
    }
    throw error;
  }
}
