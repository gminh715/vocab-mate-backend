import { Test } from '@nestjs/testing';
import type { AiConfig } from '../../../../../src/config/ai.config';
import { AI_CONFIG } from '../../../../../src/config/config.module';
import {
  CefrLevel,
  QuestionGenerationSource,
  QuestionType,
  ReviewSessionType,
} from '../../../../../generated/prisma/enums';
import type { ReviewQuestionGenerationResult } from '../../../../../src/modules/ai/ai.contracts';
import {
  REVIEW_QUESTION_PROMPT_STYLES,
  REVIEW_QUESTION_PROMPT_VERSION,
} from '../../../../../src/modules/ai/ai.contracts';
import { AiError } from '../../../../../src/modules/ai/ai.errors';
import { AiService } from '../../../../../src/modules/ai/ai.service';
import {
  type AiQuestionGenerationCandidate,
  type PreparedAiReviewQuestion,
  ReviewsRepository,
} from '../../../../../src/modules/reviews/reviews.repository';
import { AiAssistedQuestionGeneratorService } from '../../../../../src/modules/reviews/services/ai-assisted-question-generator.service';

describe('AiAssistedQuestionGeneratorService', () => {
  const config: AiConfig = {
    geminiApiKey: 'gemini-key',
    geminiModel: 'gemini-model',
    groqApiKey: 'groq-key',
    groqModel: 'groq-model',
    requestTimeoutMs: 30_000,
    reviewAgentEnabled: true,
    reviewMaxCallsPerSession: 10,
    reviewMaxDiagnosisCalls: 4,
    reviewMinConfidence: 0.65,
    reviewPromptVersion: 'review-agent-test-v1',
    reviewQuestionWarmLimit: 5,
  };
  const generated: ReviewQuestionGenerationResult = {
    prompt: 'Quick match: choose the best Vietnamese interpretation.',
    blankSentence: null,
    answerExplanation:
      'It means that something holds your interest. The lesson is enjoyable to follow.',
    distractors: ['kho hieu', 'ngan gon'],
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
  let ai: {
    generateReviewQuestion: jest.MockedFunction<
      AiService['generateReviewQuestion']
    >;
    generateReviewQuestions: jest.MockedFunction<
      AiService['generateReviewQuestions']
    >;
  };
  let repository: {
    getAiQuestionGenerationCandidates: jest.Mock;
    findCachedAiQuestion: jest.Mock;
    findPreferredCachedAiQuestion: jest.Mock;
    cacheAiQuestion: jest.MockedFunction<ReviewsRepository['cacheAiQuestion']>;
    reserveAiCallSlot: jest.Mock;
  };

  beforeEach(async () => {
    config.reviewMaxCallsPerSession = 10;
    config.reviewQuestionWarmLimit = 5;
    ai = {
      generateReviewQuestion: jest.fn().mockResolvedValue(generated),
      generateReviewQuestions: jest
        .fn()
        .mockImplementation((inputs: unknown[]) =>
          Promise.resolve(inputs.map(() => generated)),
        ),
    };
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
      reserveAiCallSlot: jest.fn().mockResolvedValue(true),
    };
    const module = await Test.createTestingModule({
      providers: [
        AiAssistedQuestionGeneratorService,
        { provide: AI_CONFIG, useValue: config },
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
    expect(ai.generateReviewQuestions).not.toHaveBeenCalled();
    expect(repository.findCachedAiQuestion).not.toHaveBeenCalled();
    expect(repository.cacheAiQuestion).not.toHaveBeenCalled();
  });

  it('generates and caches only the question type selected for the candidate', async () => {
    const prepared = await warmCache();

    expect(ai.generateReviewQuestions).toHaveBeenCalledWith([
      {
        wordOrPhrase: 'engaging',
        contextualMeaningVi: 'hap dan',
        originalSentence: 'The lesson was engaging for everyone.',
        targetCefr: CefrLevel.B1,
        requestedQuestionType: QuestionType.SELECT_MEANING,
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[0],
      },
    ]);
    expect(repository.cacheAiQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        articleSentenceTermId: 'term-1',
        questionType: QuestionType.SELECT_MEANING,
        difficultyCefr: CefrLevel.B1,
        generationSource: QuestionGenerationSource.AI,
        generationVersion: REVIEW_QUESTION_PROMPT_VERSION,
        correctAnswerText: null,
      }),
    );
    const cachedSpec = repository.cacheAiQuestion.mock.calls[0]?.[0];
    expect(cachedSpec?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optionText: 'hap dan', isCorrect: true }),
        expect.objectContaining({ optionText: 'kho hieu', isCorrect: false }),
      ]),
    );
    expect(prepared).toEqual([
      expect.objectContaining({
        userVocabularyId: 'vocabulary-1',
        quizQuestionId: 'question-term-1',
        questionType: QuestionType.SELECT_MEANING,
      }),
    ]);
  });

  it('sends only the context fields required by each question type', async () => {
    const selectWord = makeCandidate(1);
    selectWord.questionType = QuestionType.SELECT_WORD;
    const selectContext = makeCandidate(2);
    selectContext.questionType = QuestionType.SELECT_CORRECT_CONTEXT;
    repository.getAiQuestionGenerationCandidates.mockResolvedValue([
      selectWord,
      selectContext,
    ]);

    await warmCache();

    expect(ai.generateReviewQuestions).toHaveBeenCalledWith([
      {
        wordOrPhrase: 'engaging',
        contextualMeaningVi: 'hap dan',
        partOfSpeech: 'adjective',
        targetCefr: CefrLevel.B1,
        requestedQuestionType: QuestionType.SELECT_WORD,
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[0],
      },
      {
        wordOrPhrase: 'engaging',
        contextualMeaningVi: 'hap dan',
        originalSentence: 'The lesson was engaging for everyone.',
        targetCefr: CefrLevel.B1,
        requestedQuestionType: QuestionType.SELECT_CORRECT_CONTEXT,
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[1],
      },
    ]);
    const cachedSpecs = repository.cacheAiQuestion.mock.calls.map(
      ([spec]) => spec,
    );
    expect(cachedSpecs[0].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optionText: 'engaging', isCorrect: true }),
      ]),
    );
    expect(cachedSpecs[1].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          optionText: 'The lesson was engaging for everyone.',
          isCorrect: true,
        }),
      ]),
    );
  });

  it('deduplicates concurrent generation for the same cache key', async () => {
    await Promise.all([warmCache(), warmCache()]);

    expect(ai.generateReviewQuestions).toHaveBeenCalledTimes(1);
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
    ai.generateReviewQuestions.mockRejectedValue(
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

  it('omits a failed batch but continues with the next bounded batch', async () => {
    config.reviewQuestionWarmLimit = 2;
    repository.getAiQuestionGenerationCandidates.mockResolvedValue([
      makeCandidate(1),
      makeCandidate(2),
      makeCandidate(3),
      makeCandidate(4),
      makeCandidate(5),
    ]);
    ai.generateReviewQuestions
      .mockRejectedValueOnce(
        new AiError(
          'PROVIDER_UNAVAILABLE',
          'AI service is temporarily unavailable',
        ),
      )
      .mockResolvedValueOnce([generated]);

    await expect(warmCache()).resolves.toEqual([
      expect.objectContaining({ userVocabularyId: 'vocabulary-5' }),
    ]);
    expect(ai.generateReviewQuestions).toHaveBeenCalledTimes(2);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(1);
  });

  it('caps synchronous generation attempts for a 20-word session', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)),
    );

    const onAiCallReserved = jest.fn();
    const prepared = await service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date('2026-08-03T00:00:00Z'),
      onAiCallReserved,
    );

    expect(ai.generateReviewQuestions).toHaveBeenCalledTimes(5);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(20);
    expect(prepared).toHaveLength(20);
    expect(onAiCallReserved).toHaveBeenCalledTimes(5);
  });

  it('runs no more than two cold batches concurrently and reports item progress', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)),
    );
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    ai.generateReviewQuestions.mockImplementation(async (inputs: unknown[]) => {
      activeCalls += 1;
      maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeCalls -= 1;
      return inputs.map(() => generated);
    });
    const onProgress = jest.fn();

    const prepared = await service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date('2026-08-03T00:00:00Z'),
      undefined,
      onProgress,
    );

    expect(prepared).toHaveLength(20);
    expect(maximumActiveCalls).toBe(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      completedItems: 20,
      totalItems: 20,
    });
  });

  it('keeps all cache hits while spending the batch budget only on cold questions', async () => {
    config.reviewQuestionWarmLimit = 1;
    const candidates = Array.from({ length: 20 }, (_, index) => {
      const candidateNumber = index + 1;
      const cached =
        candidateNumber <= 16
          ? {
              userVocabularyId: `vocabulary-${candidateNumber}`,
              quizQuestionId: `cached-${candidateNumber}`,
              articleSentenceTermId: `term-${candidateNumber}`,
              difficultyCefr: CefrLevel.B1,
              questionType: QuestionType.SELECT_MEANING,
            }
          : null;
      return makeCandidate(candidateNumber, cached);
    });
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(candidates);

    const prepared = await warmCache();

    expect(prepared).toHaveLength(20);
    expect(ai.generateReviewQuestions).toHaveBeenCalledTimes(1);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(4);
  });

  it('cycles engaging prompt styles within a generated batch', async () => {
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => makeCandidate(index + 1)),
    );

    await warmCache();

    expect(ai.generateReviewQuestions).toHaveBeenCalledWith([
      expect.objectContaining({
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[0],
      }),
      expect.objectContaining({
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[1],
      }),
      expect.objectContaining({
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[2],
      }),
      expect.objectContaining({
        promptStyle: REVIEW_QUESTION_PROMPT_STYLES[3],
      }),
    ]);
  });

  it('caps warm reservations by the shared per-session AI budget', async () => {
    config.reviewQuestionWarmLimit = 4;
    config.reviewMaxCallsPerSession = 1;
    repository.getAiQuestionGenerationCandidates.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => makeCandidate(index + 1)),
    );
    const onAiCallReserved = jest.fn();

    const prepared = await service.warmCache(
      'user',
      { sessionType: ReviewSessionType.DAILY_REVIEW, limit: 20 },
      new Date('2026-08-03T00:00:00Z'),
      onAiCallReserved,
    );

    expect(onAiCallReserved).toHaveBeenCalledTimes(1);
    expect(ai.generateReviewQuestions).toHaveBeenCalledTimes(1);
    expect(prepared).toHaveLength(4);
  });

  it('prepares a requested retest type through the same cache-first AI path', async () => {
    const candidate = makeCandidate(1);

    await expect(
      service.prepareRetestQuestion(
        'user',
        'session',
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toMatchObject({
      userVocabularyId: 'vocabulary-1',
      questionType: QuestionType.FILL_BLANK,
    });
    const retestInput = ai.generateReviewQuestion.mock.calls[0]?.[0];
    expect(retestInput).toMatchObject({
      wordOrPhrase: 'engaging',
      contextualMeaningVi: 'hap dan',
      partOfSpeech: 'adjective',
      targetCefr: CefrLevel.B1,
      requestedQuestionType: QuestionType.FILL_BLANK,
    });
    expect(REVIEW_QUESTION_PROMPT_STYLES).toContain(retestInput?.promptStyle);
    expect(repository.reserveAiCallSlot).toHaveBeenCalledWith(
      'user',
      'session',
      config.reviewMaxCallsPerSession,
    );
    expect(repository.cacheAiQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        correctAnswerText: 'engaging',
        options: [],
      }),
    );
  });

  it('uses a cached retest without spending a session call slot', async () => {
    const candidate = makeCandidate(1);
    repository.findCachedAiQuestion.mockResolvedValue({ id: 'cached-retest' });

    await expect(
      service.prepareRetestQuestion(
        'user',
        'session',
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toMatchObject({ quizQuestionId: 'cached-retest' });
    expect(repository.reserveAiCallSlot).not.toHaveBeenCalled();
    expect(ai.generateReviewQuestion).not.toHaveBeenCalled();
  });

  it('shares one reserved call slot across concurrent retests for the same cache key', async () => {
    const candidate = makeCandidate(1);
    let releaseReservation: (reserved: boolean) => void = () => undefined;
    const reservation = new Promise<boolean>((resolve) => {
      releaseReservation = resolve;
    });
    repository.reserveAiCallSlot.mockReturnValue(reservation);

    const retests = Promise.all([
      service.prepareRetestQuestion(
        'user',
        'session',
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
      service.prepareRetestQuestion(
        'user',
        'session',
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ]);
    await Promise.resolve();
    releaseReservation(true);
    await retests;

    expect(repository.reserveAiCallSlot).toHaveBeenCalledTimes(1);
    expect(ai.generateReviewQuestion).toHaveBeenCalledTimes(1);
    expect(repository.cacheAiQuestion).toHaveBeenCalledTimes(1);
  });

  it('keeps the deterministic retest when the shared session budget is exhausted', async () => {
    const candidate = makeCandidate(1);
    repository.reserveAiCallSlot.mockResolvedValue(false);

    await expect(
      service.prepareRetestQuestion(
        'user',
        'session',
        candidate.vocabulary,
        QuestionType.FILL_BLANK,
      ),
    ).resolves.toBeNull();
    expect(repository.reserveAiCallSlot).toHaveBeenCalledWith(
      'user',
      'session',
      config.reviewMaxCallsPerSession,
    );
    expect(ai.generateReviewQuestion).not.toHaveBeenCalled();
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
        'user',
        'session',
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
