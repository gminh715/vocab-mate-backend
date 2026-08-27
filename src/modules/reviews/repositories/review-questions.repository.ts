import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import {
  type CefrLevel,
  LearningStatus,
  ReviewQuestionGenerationSource,
  type QuestionType,
  ReviewSessionStatus,
} from '../../../../generated/prisma/enums';
import { REVIEW_QUESTION_PROMPT_VERSION } from '../../ai/ai.contracts';
import { PrismaService } from '../../../database/prisma.service';
import type { ReturnTypeOfAppConfig } from '../../../config/app.config';
import { APP_CONFIG } from '../../../config/config.module';
import type { StartReviewSessionDto } from '../dto/review-request.dto';
import {
  RECENT_ACCURACY_WINDOW,
  preferredQuestionTypes,
  selectSessionQuestionTypes,
  type RecentQuestionAttempt,
} from '../services/question-selection';
import { reviewDayEnd, reviewEligibilityWhere } from './review-eligibility';

export interface AiQuestionGenerationCandidate {
  vocabulary: VocabularyQuestionSnapshot;
  questionType: QuestionType;
  preferredQuestionTypes: QuestionType[];
  cachedQuestion: PreparedAiReviewQuestion | null;
}

export interface VocabularyQuestionSnapshot {
  id: string;
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedCefrLevel: CefrLevel;
  savedContextSentence: string;
  savedMeaningVi: string;
  savedExplanation: string | null;
  categoryId: string;
  articleTopic?: string;
}

export interface GeneratedAiQuestionSpec {
  articleSentenceTermId: string;
  questionType: QuestionType;
  generationSource: typeof ReviewQuestionGenerationSource.AI;
  generationVersion: string;
  difficultyCefr: CefrLevel;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
  options: Array<{
    optionText: string;
    isCorrect: boolean;
    explanation: string | null;
    displayOrder: number;
  }>;
}

export interface PreparedAiReviewQuestion {
  userVocabularyId: string;
  reviewQuestionId: string;
  articleSentenceTermId: string;
  difficultyCefr: CefrLevel;
  questionType: QuestionType;
}

const reviewVocabularySelect = {
  id: true,
  articleSentenceTermId: true,
  learningStatus: true,
  savedWordDisplay: true,
  savedLemma: true,
  savedPartOfSpeech: true,
  savedMeaningVi: true,
  savedContextSentence: true,
  savedExplanation: true,
  savedCefrLevel: true,
  consecutiveCorrectReviews: true,
  lastReviewScore: true,
  articleSentenceTerm: {
    select: {
      sentence: {
        select: {
          article: {
            select: {
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserVocabularySelect;

type ReviewVocabulary = Prisma.UserVocabularyGetPayload<{
  select: typeof reviewVocabularySelect;
}>;

/** Persistence boundary for generated and cached review questions. */
@Injectable()
export class ReviewQuestionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly appConfig: ReturnTypeOfAppConfig,
  ) {}

  /** Atomically reserves a session AI-call slot before generating a cache miss. */
  async reserveGenerationCall(
    userId: string,
    reviewSessionId: string,
    maximumCalls: number,
  ): Promise<boolean> {
    if (!Number.isInteger(maximumCalls) || maximumCalls < 1) {
      throw new RangeError('maximumCalls must be a positive integer');
    }
    const reservation = await this.prisma.reviewSession.updateMany({
      where: {
        id: reviewSessionId,
        userId,
        status: ReviewSessionStatus.IN_PROGRESS,
        aiCallCount: { lt: maximumCalls },
      },
      data: { aiCallCount: { increment: 1 } },
    });
    return reservation.count === 1;
  }

  getAiQuestionGenerationCandidates(
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<AiQuestionGenerationCandidate[]> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.reviewSession.findFirst({
        where: {
          userId,
          status: ReviewSessionStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      if (active) return [];

      const vocabularies = await this.findEligibleVocabularies(
        tx,
        userId,
        dto,
        now,
      );
      const history = await this.loadRecentAttemptHistory(tx, vocabularies);
      const cachedQuestions =
        vocabularies.length === 0
          ? []
          : await tx.reviewQuestion.findMany({
              where: {
                articleSentenceTermId: {
                  in: vocabularies.map(
                    ({ articleSentenceTermId }) => articleSentenceTermId,
                  ),
                },
                generationSource: ReviewQuestionGenerationSource.AI,
                generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
                isActive: true,
              },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              select: {
                id: true,
                articleSentenceTermId: true,
                difficultyCefr: true,
                questionType: true,
              },
            });
      const preferences = vocabularies.map((vocabulary) =>
        preferredQuestionTypes(
          vocabulary,
          history.get(vocabulary.id) ?? [],
          undefined,
          dto.reviewGoal,
        ),
      );
      const selectedTypes = selectSessionQuestionTypes(
        preferences,
        dto.reviewGoal,
      );

      return vocabularies.map((vocabulary, index) => {
        const basePreferences = preferences[index];
        const selectedType = selectedTypes[index] ?? basePreferences[0];
        const preferredQuestionTypes = [
          selectedType,
          ...basePreferences.filter(
            (questionType) => questionType !== selectedType,
          ),
        ];
        const cached = cachedQuestions.find(
          (question) =>
            question.articleSentenceTermId ===
              vocabulary.articleSentenceTermId &&
            question.difficultyCefr === vocabulary.savedCefrLevel &&
            question.questionType === selectedType,
        );
        return {
          vocabulary: this.toQuestionSnapshot(vocabulary),
          questionType: selectedType,
          preferredQuestionTypes,
          cachedQuestion: cached
            ? this.toPreparedAiQuestion(vocabulary.id, cached)
            : null,
        };
      });
    });
  }

  findCachedAiQuestion(
    articleSentenceTermId: string,
    difficultyCefr: CefrLevel,
    questionType: QuestionType,
  ) {
    return this.prisma.reviewQuestion.findFirst({
      where: this.aiQuestionCacheWhere({
        articleSentenceTermId,
        difficultyCefr,
        questionType,
      }),
      select: { id: true },
    });
  }

  async findPreferredCachedAiQuestion(
    userVocabularyId: string,
    articleSentenceTermId: string,
    difficultyCefr: CefrLevel,
    preferredQuestionTypes: QuestionType[],
  ): Promise<PreparedAiReviewQuestion | null> {
    const cached = await this.prisma.reviewQuestion.findMany({
      where: this.aiQuestionCacheWhere({
        articleSentenceTermId,
        difficultyCefr,
        questionType: { in: preferredQuestionTypes },
      }),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        articleSentenceTermId: true,
        difficultyCefr: true,
        questionType: true,
      },
    });
    const selected = preferredQuestionTypes.flatMap((questionType) => {
      const match = cached.find(
        (question) => question.questionType === questionType,
      );
      return match ? [match] : [];
    })[0];
    return selected
      ? this.toPreparedAiQuestion(userVocabularyId, selected)
      : null;
  }

  async cacheAiQuestion(spec: GeneratedAiQuestionSpec) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cached = await tx.reviewQuestion.findFirst({
          where: this.aiQuestionCacheWhere({
            articleSentenceTermId: spec.articleSentenceTermId,
            difficultyCefr: spec.difficultyCefr,
            questionType: spec.questionType,
            generationVersion: spec.generationVersion,
          }),
          select: { id: true },
        });
        if (cached) return cached;

        const { options, ...question } = spec;
        return tx.reviewQuestion.create({
          data: {
            ...question,
            options: {
              create: options.map((option) => ({
                ...option,
                generationSource: ReviewQuestionGenerationSource.AI,
              })),
            },
          },
          select: { id: true },
        });
      });
    } catch (error: unknown) {
      if (!this.hasPrismaCode(error, 'P2002')) throw error;
      const cached = await this.findCachedAiQuestion(
        spec.articleSentenceTermId,
        spec.difficultyCefr,
        spec.questionType,
      );
      if (!cached) throw error;
      return cached;
    }
  }

  private aiQuestionCacheWhere({
    articleSentenceTermId,
    difficultyCefr,
    questionType,
    generationVersion = REVIEW_QUESTION_PROMPT_VERSION,
  }: {
    articleSentenceTermId: string;
    difficultyCefr: CefrLevel;
    questionType: Prisma.EnumQuestionTypeFilter | QuestionType;
    generationVersion?: string;
  }): Prisma.ReviewQuestionWhereInput {
    return {
      articleSentenceTermId,
      difficultyCefr,
      questionType,
      generationSource: ReviewQuestionGenerationSource.AI,
      generationVersion,
      isActive: true,
    };
  }

  private async findEligibleVocabularies(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: StartReviewSessionDto,
    now: Date,
  ): Promise<ReviewVocabulary[]> {
    const commonWhere = reviewEligibilityWhere(
      userId,
      now,
      this.appConfig.analyticsTimezone,
    );
    const dueBefore = reviewDayEnd(now, this.appConfig.analyticsTimezone);
    const selected: ReviewVocabulary[] = [];
    const take = async (
      where: Prisma.UserVocabularyWhereInput,
      orderBy: Prisma.UserVocabularyOrderByWithRelationInput[],
    ) => {
      const remaining = dto.limit - selected.length;
      if (remaining <= 0) return;
      selected.push(
        ...(await tx.userVocabulary.findMany({
          where: { ...commonWhere, ...where },
          take: remaining,
          orderBy,
          select: reviewVocabularySelect,
        })),
      );
    };
    await take({ nextReviewAt: { lt: dueBefore } }, [
      { lapseCount: 'desc' },
      { nextReviewAt: 'asc' },
      { savedAt: 'asc' },
      { id: 'asc' },
    ]);
    await take(
      {
        nextReviewAt: null,
        learningStatus: {
          in: [LearningStatus.LEARNING, LearningStatus.REVIEWING],
        },
      },
      [{ lapseCount: 'desc' }, { savedAt: 'asc' }, { id: 'asc' }],
    );
    await take({ nextReviewAt: null, learningStatus: LearningStatus.NEW }, [
      { lapseCount: 'desc' },
      { savedAt: 'asc' },
      { id: 'asc' },
    ]);
    return selected;
  }

  private async loadRecentAttemptHistory(
    tx: Prisma.TransactionClient,
    vocabularies: ReviewVocabulary[],
  ): Promise<Map<string, RecentQuestionAttempt[]>> {
    if (vocabularies.length === 0) return new Map();
    const vocabularyIds = Prisma.join(
      vocabularies.map(({ id }) => Prisma.sql`${id}::uuid`),
    );
    const rows = await tx.$queryRaw<
      Array<{
        userVocabularyId: string;
        questionType: QuestionType;
        isCorrect: boolean;
      }>
    >(Prisma.sql`
      SELECT
        recent.user_vocabulary_id AS "userVocabularyId",
        recent.question_type AS "questionType",
        recent.is_correct AS "isCorrect"
      FROM (
        SELECT
          item.user_vocabulary_id,
          question.question_type,
          answer.is_correct,
          ROW_NUMBER() OVER (
            PARTITION BY item.user_vocabulary_id
            ORDER BY answer.answered_at DESC, answer.id ASC
          ) AS recent_number
        FROM review_answers answer
        JOIN review_session_items item
          ON item.id = answer.review_session_item_id
        JOIN review_questions question
          ON question.id = answer.review_question_id
        WHERE item.user_vocabulary_id IN (${vocabularyIds})
          AND answer.is_correct IS NOT NULL
      ) recent
      WHERE recent.recent_number <= ${RECENT_ACCURACY_WINDOW}
      ORDER BY recent.user_vocabulary_id ASC, recent.recent_number ASC
    `);
    const history = new Map<string, RecentQuestionAttempt[]>();
    for (const row of rows) {
      const attempts = history.get(row.userVocabularyId) ?? [];
      attempts.push({
        questionType: row.questionType,
        isCorrect: row.isCorrect,
      });
      history.set(row.userVocabularyId, attempts);
    }
    return history;
  }

  private toQuestionSnapshot(
    vocabulary: ReviewVocabulary,
  ): VocabularyQuestionSnapshot {
    return {
      id: vocabulary.id,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      savedWordDisplay: vocabulary.savedWordDisplay,
      savedLemma: vocabulary.savedLemma,
      savedPartOfSpeech: vocabulary.savedPartOfSpeech,
      savedCefrLevel: vocabulary.savedCefrLevel,
      savedContextSentence: vocabulary.savedContextSentence,
      savedMeaningVi: vocabulary.savedMeaningVi,
      savedExplanation: vocabulary.savedExplanation,
      categoryId: vocabulary.articleSentenceTerm.sentence.article.categoryId,
      articleTopic:
        vocabulary.articleSentenceTerm.sentence.article.category?.name,
    };
  }

  private toPreparedAiQuestion(
    userVocabularyId: string,
    question: {
      id: string;
      articleSentenceTermId: string;
      difficultyCefr: CefrLevel;
      questionType: QuestionType;
    },
  ): PreparedAiReviewQuestion {
    return {
      userVocabularyId,
      reviewQuestionId: question.id,
      articleSentenceTermId: question.articleSentenceTermId,
      difficultyCefr: question.difficultyCefr,
      questionType: question.questionType,
    };
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
