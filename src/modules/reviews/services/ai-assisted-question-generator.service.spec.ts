import { Test } from '@nestjs/testing';
import { AI_CONFIG } from '../../../config/config.module';
import {
  CefrLevel,
  QuestionGenerationSource,
  QuestionType,
  ReviewSessionType,
} from '../../../../generated/prisma/enums';
import type { ReviewQuestionGenerationResult } from '../../ai/ai.contracts';
import { AiError } from '../../ai/ai.errors';
import { AiService } from '../../ai/ai.service';
import {
  type AiQuestionGenerationCandidate,
  type PreparedAiReviewQuestion,
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

  const makeCandidate = (
    index: number,
    cachedQuestion: PreparedAiReviewQuestion | null = null,
  ): AiQuestionGenerationCandidate => ({
    vocabulary: {
      id: `vocabulary-${index}`,
      articleSentenceTermId: `term-${index}`,
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
    questionType: QuestionType.SELECT_MEANING,
    preferredQuestionTypes: [
      QuestionType.SELECT_MEANING,
      QuestionType.SELECT_WORD,
    ],
    cachedQuestion,
  });

  let service: AiAssistedQuestionGeneratorService;
  let ai: { generateReviewQuestion: jest.Mock };
  let repository: {
    getAiQuestionGenerationCandidates: jest.Mock;
    findCachedAiQuestion: jest.Mock;
    findPreferredCachedAiQuestion: jest.Mock;
    cacheAiQuestion: jest.Mock;
  };

  beforeEach(async () => {
    ai = { generateReviewQuestion: jest.fn().mockResolvedValue(generated) };
    repository = {
      getAiQuestionGenerationCandidates: jest
        .fn()
        .mockResolvedValue([makeCandidate(1)]),
      findCachedAiQuestion: jest.fn().mockResolvedValue(null),
      findPreferredCachedAiQuestion: jest.fn().mockResolvedValue(null),
      cacheAiQuestion: jest
        .fn()
        .mockImplementation((spec: { articleSentenceTermId: string }) =>
          Promise.resolve({ id: `question-${spec.articleSentenceTermId}` }),
        ),
    };
    const module = await Test.createTestingModule({
      providers: [
        AiAssistedQuestionGeneratorService,
        {
          provide: AI_CONFIG,
          useValue: { reviewQuestionWarmLimit: 2 },
        },
        { provide: AiService, useValue: ai },
        { provide: ReviewsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(AiAssistedQuestionGeneratorService);
  });

  const warmCache = () =>
    service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date('2026-08-03T00:00:00Z'),
    );

  it('returns a valid cache hit without calling either generation path', async () => {
    const cached: PreparedAiReviewQuestion = {
      userVocabularyId: 'vocabulary-1',
      quizQuestionId: 'cached-ai',
      articleSentenceTermId: 'term-1',
      difficultyCefr: CefrLevel.B1,
      questionType: QuestionType.SELECT_WORD,
    };
    repository.getAiQuestionGenerationCandidates.mockResolvedValue([
      makeCandidate(1, cached),
    ]);

    await expect(warmCache()).resolves.toEqual([cached]);
    expect(ai.generateReviewQuestion).not.toHaveBeenCalled();
    expect(repository.findCachedAiQuestion).not.toHaveBeenCalled();
    expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
  });

  it('generates and caches only the question type selected for the candidate', async () => {
    const prepared = await warmCache();

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
        articleSentenceTermId: 'term-1',
        questionType: QuestionType.SELECT_MEANING,
        difficultyCefr: CefrLevel.B1,
        generationSource: QuestionGenerationSource.AI,
      }),
    );
    expect(prepared).toEqual([
      expect.objectContaining({
        userVocabularyId: 'vocabulary-1',
        quizQuestionId: 'question-term-1',
        questionType: QuestionType.SELECT_MEANING,
      }),
    ]);
  });

  it('deduplicates concurrent generation for the same cache key', async () => {
    await Promise.all([warmCache(), warmCache()]);

    expect(ai.generateReviewQuestion).toHaveBeenCalledTimes(1);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(1);
  });

  it('uses a concurrently cached preferred AI question after provider failure', async () => {
    const cachedAlternative: PreparedAiReviewQuestion = {
      userVocabularyId: 'vocabulary-1',
      quizQuestionId: 'cached-alternative',
      articleSentenceTermId: 'term-1',
      difficultyCefr: CefrLevel.B1,
      questionType: QuestionType.SELECT_WORD,
    };
    ai.generateReviewQuestion.mockRejectedValue(
      new AiError(
        'PROVIDER_UNAVAILABLE',
        'AI service is temporarily unavailable',
      ),
    );
    repository.findPreferredCachedAiQuestion.mockResolvedValue(
      cachedAlternative,
    );

    await expect(warmCache()).resolves.toEqual([cachedAlternative]);
    expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
  });

  it('omits only the candidate that has no valid AI question', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue([
      makeCandidate(1),
      makeCandidate(2),
    ]);
    ai.generateReviewQuestion
      .mockRejectedValueOnce(
        new AiError(
          'PROVIDER_UNAVAILABLE',
          'AI service is temporarily unavailable',
        ),
      )
      .mockResolvedValueOnce(generated);

    await expect(warmCache()).resolves.toEqual([
      expect.objectContaining({ userVocabularyId: 'vocabulary-2' }),
    ]);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(1);
  });

  it('caps synchronous generation attempts for a 20-word session', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)),
    );

    const prepared = await warmCache();

    expect(ai.generateReviewQuestion).toHaveBeenCalledTimes(2);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(2);
    expect(prepared).toHaveLength(2);
  });

  it('prepares a requested retest type through the same cache-first AI path', async () => {
    const candidate = makeCandidate(1);

    await expect(
      service.prepareRetestQuestion(
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toMatchObject({
      userVocabularyId: 'vocabulary-1',
      questionType: QuestionType.FILL_BLANK,
    });
    expect(ai.generateReviewQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedQuestionType: QuestionType.FILL_BLANK,
      }),
    );
  });

  it('returns no rule-based retest when both providers and the AI cache are unavailable', async () => {
    const candidate = makeCandidate(1);
    ai.generateReviewQuestion.mockRejectedValue(
      new AiError(
        'PROVIDER_UNAVAILABLE',
        'AI service is temporarily unavailable',
      ),
    );

    await expect(
      service.prepareRetestQuestion(
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toBeNull();
    expect(repository.findPreferredCachedAiQuestion).toHaveBeenCalledWith(
      'vocabulary-1',
      'term-1',
      CefrLevel.B1,
      [QuestionType.FILL_BLANK],
    );
    expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
  });
});
