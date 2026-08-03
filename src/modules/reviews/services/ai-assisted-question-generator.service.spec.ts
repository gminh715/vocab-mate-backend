import { Test } from '@nestjs/testing';
import {
  CefrLevel,
  LearningStatus,
  QuestionGenerationSource,
  QuestionType,
  ReviewSessionType,
} from '../../../../generated/prisma/enums';
import type { ReviewQuestionGenerationResult } from '../../ai/ai.contracts';
import { AiError } from '../../ai/ai.errors';
import { AiService } from '../../ai/ai.service';
import {
  type AiQuestionGenerationCandidate,
  ReviewsRepository,
} from '../reviews.repository';
import { AiAssistedQuestionGeneratorService } from './ai-assisted-question-generator.service';

describe('AiAssistedQuestionGeneratorService', () => {
  const generated: ReviewQuestionGenerationResult = {
    prompt: 'What does "engaging" mean here?',
    blankSentence: null,
    correctAnswerText: null,
    answerExplanation:
      'It means that something holds your interest. The lesson is enjoyable to follow.',
    options: [
      { optionText: 'hap dan', isCorrect: true },
      { optionText: 'kho hieu', isCorrect: false },
      { optionText: 'ngan gon', isCorrect: false },
    ],
  };
  const candidate: AiQuestionGenerationCandidate = {
    vocabulary: {
      id: 'vocabulary',
      articleSentenceTermId: 'term',
      savedWordDisplay: 'engaging',
      savedLemma: 'engage',
      savedPartOfSpeech: 'adjective',
      savedCefrLevel: CefrLevel.B1,
      savedContextSentence: 'The lesson was engaging for everyone.',
      savedMeaningVi: 'hap dan',
      savedExplanation: 'Interesting in this lesson context.',
      categoryId: 'category',
      articleTopic: 'Education',
    },
    questionTypes: [QuestionType.SELECT_MEANING],
  };

  let service: AiAssistedQuestionGeneratorService;
  let ai: { generateReviewQuestion: jest.Mock };
  let repository: {
    getAiQuestionGenerationCandidates: jest.Mock;
    findCachedAiQuestion: jest.Mock;
    cacheAiQuestion: jest.Mock;
  };

  beforeEach(async () => {
    ai = { generateReviewQuestion: jest.fn().mockResolvedValue(generated) };
    repository = {
      getAiQuestionGenerationCandidates: jest
        .fn()
        .mockResolvedValue([candidate]),
      findCachedAiQuestion: jest.fn().mockResolvedValue(null),
      cacheAiQuestion: jest.fn().mockResolvedValue({ id: 'ai-question' }),
    };
    const module = await Test.createTestingModule({
      providers: [
        AiAssistedQuestionGeneratorService,
        { provide: AiService, useValue: ai },
        { provide: ReviewsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(AiAssistedQuestionGeneratorService);
  });

  it('caches a validated AI question and option provenance without user history', async () => {
    await service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date('2026-08-03T00:00:00Z'),
    );

    expect(ai.generateReviewQuestion).toHaveBeenCalledWith({
      wordOrPhrase: 'engaging',
      lemma: 'engage',
      partOfSpeech: 'adjective',
      contextualMeaningVi: 'hap dan',
      originalSentence: 'The lesson was engaging for everyone.',
      articleTopic: 'Education',
      targetCefr: CefrLevel.B1,
      requestedQuestionType: QuestionType.SELECT_MEANING,
    });
    expect(repository.cacheAiQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        articleSentenceTermId: 'term',
        difficultyCefr: CefrLevel.B1,
        generationSource: QuestionGenerationSource.AI,
        options: [
          expect.objectContaining({ optionText: 'hap dan', isCorrect: true }),
          expect.objectContaining({ optionText: 'kho hieu', isCorrect: false }),
          expect.objectContaining({ optionText: 'ngan gon', isCorrect: false }),
        ],
      }),
    );
  });

  it('reuses a term-context and CEFR cache entry for another user', async () => {
    repository.findCachedAiQuestion.mockResolvedValue({ id: 'cached-ai' });

    await service.warmCache(
      'other-user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date(),
    );

    expect(repository.findCachedAiQuestion).toHaveBeenCalledWith(
      'term',
      CefrLevel.B1,
      QuestionType.SELECT_MEANING,
    );
    expect(ai.generateReviewQuestion).not.toHaveBeenCalled();
    expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent generation for the same cache key', async () => {
    await Promise.all([
      service.warmCache(
        'first-user',
        { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
        new Date(),
      ),
      service.warmCache(
        'second-user',
        { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
        new Date(),
      ),
    ]);

    expect(ai.generateReviewQuestion).toHaveBeenCalledTimes(1);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid structured output', 'timeout or quota'])(
    'returns immediately so rule generation can handle %s',
    async () => {
      ai.generateReviewQuestion.mockRejectedValue(
        new AiError(
          'PROVIDER_UNAVAILABLE',
          'AI service is temporarily unavailable',
        ),
      );

      await expect(
        service.warmCache(
          'user',
          { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
          new Date(),
        ),
      ).resolves.toBeUndefined();
      expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
    },
  );

  it('pre-generates a second remedial type selected for repeated confusion', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue([
      {
        ...candidate,
        vocabulary: {
          ...candidate.vocabulary,
          learningStatus: LearningStatus.LEARNING,
        },
        questionTypes: [
          QuestionType.SELECT_CORRECT_CONTEXT,
          QuestionType.SELECT_WORD,
        ],
      },
    ]);
    ai.generateReviewQuestion
      .mockResolvedValueOnce({
        ...generated,
        options: [
          {
            optionText: candidate.vocabulary.savedContextSentence,
            isCorrect: true,
          },
          { optionText: 'Wrong context one.', isCorrect: false },
          { optionText: 'Wrong context two.', isCorrect: false },
        ],
      })
      .mockResolvedValueOnce({
        ...generated,
        options: [
          { optionText: 'engaging', isCorrect: true },
          { optionText: 'boring', isCorrect: false },
          { optionText: 'brief', isCorrect: false },
        ],
      });

    await service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date(),
    );

    expect(ai.generateReviewQuestion).toHaveBeenCalledTimes(2);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(2);
  });
});
