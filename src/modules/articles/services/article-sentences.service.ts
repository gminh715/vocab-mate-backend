import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ArticleStatus } from '../../../../generated/prisma/enums';
import {
  ArticleSentenceListQueryDto,
  ParseArticleContentDto,
  UpdateArticleSentenceDto,
} from '../dto/article-sentence.dto';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';
import { SentenceParserHelper } from '../helpers/sentence-parser.helper';
import {
  ArticleParseStateConflictError,
  type ArticleSentenceDetailRecord,
  type ArticleSentenceRecord,
  ArticlesRepository,
} from '../repositories/articles.repository';

const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class ArticleSentencesService {
  constructor(private readonly articlesRepository: ArticlesRepository) {}

  async parseContent(
    actingAdminId: string,
    articleId: string,
    dto: ParseArticleContentDto,
  ): Promise<{
    contentVersion: number;
    sentenceCount: number;
    contentHtml: string;
  }> {
    const state = await this.articlesRepository.findMutationState(articleId);
    if (!state) throw new NotFoundException('Article not found');
    if (state.status === ArticleStatus.ARCHIVED) {
      throw new ConflictException('Archived articles cannot be parsed');
    }

    const existingSentenceCount = await this.articlesRepository.countSentences(
      articleId,
      state.contentVersion,
    );
    if (existingSentenceCount > 0 && dto.force !== true) {
      throw new ConflictException(
        'The current article content version has already been parsed',
      );
    }

    const sanitizedContent = HtmlSanitizerHelper.sanitize(state.contentHtml);
    const parsed = SentenceParserHelper.parse(sanitizedContent);
    const annotatedContentHtml = HtmlSanitizerHelper.sanitize(
      parsed.contentHtml,
    );
    if (parsed.sentences.length === 0) {
      throw new UnprocessableEntityException(
        'Article content contains no parseable reading sentences',
      );
    }

    try {
      await this.articlesRepository.replaceParsedContent({
        articleId,
        contentVersion: state.contentVersion,
        sourceContentHtml: state.contentHtml,
        annotatedContentHtml,
        actingAdminId,
        sentences: parsed.sentences,
      });
    } catch (error: unknown) {
      if (error instanceof ArticleParseStateConflictError) {
        throw new ConflictException(
          'Article content changed while parsing; retry the request',
        );
      }
      if (hasPrismaCode(error, 'P2003')) {
        throw new ConflictException(
          'The current sentence set is referenced and cannot be force-reparsed',
        );
      }
      throw error;
    }

    return {
      contentVersion: state.contentVersion,
      sentenceCount: parsed.sentences.length,
      contentHtml: annotatedContentHtml,
    };
  }

  async findAll(articleId: string, query: ArticleSentenceListQueryDto) {
    const result = await this.articlesRepository.findSentences(
      articleId,
      query,
    );
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

  async findOne(
    articleId: string,
    sentenceId: string,
  ): Promise<ArticleSentenceDetailRecord> {
    const detail = await this.articlesRepository.findSentenceDetail(
      articleId,
      sentenceId,
    );
    if (!detail) throw new NotFoundException('Sentence not found');
    return detail;
  }

  async update(
    actingAdminId: string,
    articleId: string,
    sentenceId: string,
    dto: UpdateArticleSentenceDto,
  ): Promise<{ sentence: ArticleSentenceRecord }> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one sentence field is required');
    }
    const sentence = await this.articlesRepository.updateSentence(
      articleId,
      sentenceId,
      {
        ...(dto.translationVi === undefined
          ? {}
          : { translationVi: dto.translationVi }),
        ...(dto.explanationVi === undefined
          ? {}
          : { explanationVi: dto.explanationVi }),
        ...(dto.referenceExplanation === undefined
          ? {}
          : { referenceExplanation: dto.referenceExplanation }),
        ...(dto.skill === undefined ? {} : { skill: dto.skill }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        updatedByUserId: actingAdminId,
      },
    );
    if (!sentence) throw new NotFoundException('Sentence not found');
    return { sentence };
  }
}
