import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ArticleStatus } from '../../../../generated/prisma/enums';
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
import {
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
  type CreateArticleTermInput,
  type UpdateArticleTermInput,
  ArticlesRepository,
} from '../repositories/articles.repository';

const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class ArticleTermsService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}

  async create(
    actingAdminId: string,
    articleId: string,
    sentenceId: string,
    dto: CreateArticleTermDto,
  ) {
    const context = await this.articlesRepository.findSentenceTermContext(
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
    this.requireTextMatch(
      context.sentence.sentenceText,
      dto.value,
      dto.unitType,
    );

    const termId = randomUUID();
    let updatedContentHtml: string;
    try {
      updatedContentHtml = TermMarkerHelper.insert(
        context.article.contentHtml,
        sentenceId,
        termId,
        dto.value,
        dto.unitType,
      );
    } catch (error: unknown) {
      this.mapMarkerError(error);
    }

    try {
      const term = await this.articlesRepository.createTermWithMarker(
        {
          articleId,
          sentenceId,
          termId,
          contentVersion: context.article.contentVersion,
          sourceContentHtml: context.article.contentHtml,
          updatedContentHtml,
          actingAdminId,
        },
        this.toCreateInput(actingAdminId, sentenceId, termId, dto),
      );
      return { term, updatedContentHtml };
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async findAll(articleId: string, query: ArticleTermListQueryDto) {
    const result = await this.articlesRepository.findTerms(articleId, {
      page: query.page,
      limit: query.limit,
      ...(query.sentenceId ? { sentenceId: query.sentenceId } : {}),
      ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
      ...(query.unitType ? { unitType: query.unitType } : {}),
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
    const detail = await this.articlesRepository.findTermDetail(
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
    const context = await this.articlesRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireMutableArticle(context.article.status);

    const nextValue = dto.value ?? context.term.value;
    const nextUnitType = dto.unitType ?? context.term.unitType;
    const markerShapeRequested =
      dto.value !== undefined || dto.unitType !== undefined;
    let updatedContentHtml = context.article.contentHtml;

    try {
      TermMarkerHelper.assertMarker(
        context.article.contentHtml,
        context.sentence.id,
        termId,
      );
      if (markerShapeRequested) {
        if (!context.sentence.isActive) {
          throw new ConflictException(
            'Term markers cannot be changed in an inactive sentence',
          );
        }
        this.requireTextMatch(
          context.sentence.sentenceText,
          nextValue,
          nextUnitType,
        );
        updatedContentHtml = TermMarkerHelper.replace(
          context.article.contentHtml,
          context.sentence.id,
          termId,
          nextValue,
          nextUnitType,
        );
      }
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.mapMarkerError(error);
    }

    const contentHtmlChanged =
      updatedContentHtml !== context.article.contentHtml;
    const input = this.toUpdateInput(actingAdminId, dto);
    try {
      const term = contentHtmlChanged
        ? await this.articlesRepository.updateTermWithMarker(
            {
              articleId,
              sentenceId: context.sentence.id,
              termId,
              contentVersion: context.article.contentVersion,
              sourceContentHtml: context.article.contentHtml,
              updatedContentHtml,
              actingAdminId,
            },
            input,
          )
        : await this.articlesRepository.updateTermMetadata(
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

  async delete(
    actingAdminId: string,
    articleId: string,
    termId: string,
  ): Promise<void> {
    const context = await this.articlesRepository.findTermMutationContext(
      articleId,
      termId,
    );
    if (!context) throw new NotFoundException('Term not found');
    this.requireMutableArticle(context.article.status);

    let updatedContentHtml: string;
    try {
      updatedContentHtml = TermMarkerHelper.unwrap(
        context.article.contentHtml,
        context.sentence.id,
        termId,
      );
    } catch (error: unknown) {
      this.mapMarkerError(error);
    }

    try {
      await this.articlesRepository.deleteTermWithMarker({
        articleId,
        sentenceId: context.sentence.id,
        termId,
        contentVersion: context.article.contentVersion,
        sourceContentHtml: context.article.contentHtml,
        updatedContentHtml,
        actingAdminId,
      });
    } catch (error: unknown) {
      if (
        error instanceof ArticleTermReferencedError ||
        hasPrismaCode(error, 'P2003')
      ) {
        throw new ConflictException(
          'Term is referenced by vocabulary, quiz, or review history and cannot be deleted',
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

  private requireTextMatch(
    sentenceText: string,
    value: string,
    unitType: 'WORD' | 'PHRASE',
  ): void {
    if (!TermMarkerHelper.matchesText(sentenceText, value, unitType)) {
      throw new UnprocessableEntityException(
        'Term value does not match the selected sentence',
      );
    }
  }

  private toCreateInput(
    actingAdminId: string,
    sentenceId: string,
    termId: string,
    dto: CreateArticleTermDto,
  ): CreateArticleTermInput {
    return {
      id: termId,
      sentenceId,
      value: dto.value,
      wordDisplay: dto.wordDisplay,
      lemma: dto.lemma,
      normalizedLemma: dto.normalizedLemma.toLocaleLowerCase('en-US'),
      unitType: dto.unitType,
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
      ...(dto.vocabularyTopic === undefined
        ? {}
        : { vocabularyTopic: dto.vocabularyTopic }),
      examples: (dto.examples ?? []).map(({ sentence, translationVi }) => ({
        sentence,
        translationVi,
      })),
      ...(dto.skill === undefined ? {} : { skill: dto.skill }),
      isLookupEnabled: dto.isLookupEnabled ?? true,
      isActive: dto.isActive ?? true,
      createdByUserId: actingAdminId,
      updatedByUserId: actingAdminId,
    };
  }

  private toUpdateInput(
    actingAdminId: string,
    dto: UpdateArticleTermDto,
  ): UpdateArticleTermInput {
    return {
      ...(dto.value === undefined ? {} : { value: dto.value }),
      ...(dto.wordDisplay === undefined
        ? {}
        : { wordDisplay: dto.wordDisplay }),
      ...(dto.lemma === undefined ? {} : { lemma: dto.lemma }),
      ...(dto.normalizedLemma === undefined
        ? {}
        : {
            normalizedLemma: dto.normalizedLemma.toLocaleLowerCase('en-US'),
          }),
      ...(dto.unitType === undefined ? {} : { unitType: dto.unitType }),
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
      ...(dto.vocabularyTopic === undefined
        ? {}
        : { vocabularyTopic: dto.vocabularyTopic }),
      ...(dto.examples === undefined
        ? {}
        : {
            examples: dto.examples.map(({ sentence, translationVi }) => ({
              sentence,
              translationVi,
            })),
          }),
      ...(dto.skill === undefined ? {} : { skill: dto.skill }),
      ...(dto.isLookupEnabled === undefined
        ? {}
        : { isLookupEnabled: dto.isLookupEnabled }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      updatedByUserId: actingAdminId,
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
