import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ArticleStatus,
  QuestionType,
  QuizStatus,
} from '../../../../generated/prisma/enums';
import {
  type QuizPublicationQuestionRecord,
  type QuizPublicationSnapshot,
  type QuizStatusTransitionInput,
  QuizzesRepository,
  QuizStatusTransitionConflictError,
} from '../repositories/quizzes.repository';
import { QuizPublicationService } from './quiz-publication.service';

interface RepositoryMock {
  findPublicationSnapshot: jest.Mock;
  findQuizLifecycleState: jest.Mock;
  transitionQuizStatus: jest.Mock;
}

const optionQuestion = (
  id: string,
  questionType: QuestionType,
  displayOrder: number,
): QuizPublicationQuestionRecord => ({
  id,
  questionType,
  prompt: 'Choose the correct answer',
  blankSentence: null,
  correctAnswerText: null,
  points: 1,
  displayOrder,
  articleSentenceTerm: {
    isActive: true,
    sentence: {
      articleId: 'article-id',
      contentVersion: 3,
      isActive: true,
    },
  },
  options: [
    {
      id: `${id}-option-1`,
      optionText: 'Correct',
      isCorrect: true,
      displayOrder: 1,
    },
    {
      id: `${id}-option-2`,
      optionText: 'Incorrect',
      isCorrect: false,
      displayOrder: 2,
    },
  ],
});

const validSnapshot = (): QuizPublicationSnapshot => ({
  quiz: {
    id: 'quiz-id',
    articleId: 'article-id',
    status: QuizStatus.DRAFT,
    publishedAt: null,
  },
  article: {
    id: 'article-id',
    status: ArticleStatus.PUBLISHED,
    contentVersion: 3,
  },
  questions: [
    optionQuestion('select-meaning', QuestionType.SELECT_MEANING, 1),
    optionQuestion('select-word', QuestionType.SELECT_WORD, 2),
    optionQuestion('select-context', QuestionType.SELECT_CORRECT_CONTEXT, 3),
    {
      id: 'fill-blank',
      questionType: QuestionType.FILL_BLANK,
      prompt: 'Complete the sentence',
      blankSentence: 'This is a ___ sentence.',
      correctAnswerText: 'sample',
      points: 2,
      displayOrder: 4,
      articleSentenceTerm: {
        isActive: true,
        sentence: {
          articleId: 'article-id',
          contentVersion: 3,
          isActive: true,
        },
      },
      options: [],
    },
  ],
});

describe('QuizPublicationService', () => {
  let service: QuizPublicationService;
  let repository: RepositoryMock;

  beforeEach(async () => {
    repository = {
      findPublicationSnapshot: jest.fn(),
      findQuizLifecycleState: jest.fn(),
      transitionQuizStatus: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizPublicationService,
        { provide: QuizzesRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(QuizPublicationService);
  });

  it('publishes a valid draft containing all four question types', async () => {
    const publishedAt = new Date('2026-07-24T12:00:00Z');
    let transitionInput: QuizStatusTransitionInput | undefined;
    repository.findPublicationSnapshot.mockResolvedValue(validSnapshot());
    repository.transitionQuizStatus.mockImplementation(
      (input: QuizStatusTransitionInput) => {
        transitionInput = input;
        return Promise.resolve({
          id: 'quiz-id',
          status: QuizStatus.PUBLISHED,
          publishedAt,
        });
      },
    );

    await expect(service.publish('jwt-admin', 'quiz-id')).resolves.toEqual({
      id: 'quiz-id',
      status: QuizStatus.PUBLISHED,
      publishedAt,
    });
    expect(transitionInput).toMatchObject({
      quizId: 'quiz-id',
      expectedStatus: QuizStatus.DRAFT,
      status: QuizStatus.PUBLISHED,
      requirePublishedArticle: true,
      updatedByUserId: 'jwt-admin',
    });
    expect(transitionInput?.publishedAt).toBeInstanceOf(Date);
  });

  it('returns 404 for a missing quiz and 409 for a non-draft publish', async () => {
    repository.findPublicationSnapshot.mockResolvedValueOnce(null);
    await expect(service.publish('admin', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const snapshot = validSnapshot();
    snapshot.quiz.status = QuizStatus.PUBLISHED;
    repository.findPublicationSnapshot.mockResolvedValueOnce(snapshot);
    await expect(service.publish('admin', 'quiz-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.transitionQuizStatus).not.toHaveBeenCalled();
  });

  it('rejects an unpublished article and an empty active-question set', async () => {
    const snapshot = validSnapshot();
    snapshot.article.status = ArticleStatus.DRAFT;
    snapshot.questions = [];
    repository.findPublicationSnapshot.mockResolvedValue(snapshot);

    const issues = service.validateForPublication(snapshot);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['ARTICLE_NOT_PUBLISHED', 'NO_ACTIVE_QUESTIONS']),
    );
    await expect(service.publish('admin', 'quiz-id')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repository.transitionQuizStatus).not.toHaveBeenCalled();
  });

  it('validates prompt, points, question order, and current term ownership', () => {
    const snapshot = validSnapshot();
    const question = snapshot.questions[0];
    question.prompt = ' ';
    question.points = 0;
    question.displayOrder = snapshot.questions[1].displayOrder;
    question.articleSentenceTerm.isActive = false;
    question.articleSentenceTerm.sentence.articleId = 'other-article';
    question.articleSentenceTerm.sentence.contentVersion = 2;

    expect(service.validateForPublication(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'QUESTION_PROMPT_BLANK' }),
        expect.objectContaining({ code: 'QUESTION_POINTS_INVALID' }),
        expect.objectContaining({ code: 'QUESTION_DISPLAY_ORDER_INVALID' }),
        expect.objectContaining({ code: 'QUESTION_TERM_WRONG_ARTICLE' }),
        expect.objectContaining({
          code: 'QUESTION_TERM_NOT_CURRENT_ACTIVE',
        }),
      ]),
    );
  });

  it('validates every FILL_BLANK structural requirement', () => {
    const snapshot = validSnapshot();
    const question = snapshot.questions[3];
    question.blankSentence = ' ';
    question.correctAnswerText = null;
    question.options = [
      {
        id: 'invalid-fill-option',
        optionText: 'Option',
        isCorrect: true,
        displayOrder: 1,
      },
    ];

    expect(service.validateForPublication(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FILL_BLANK_SENTENCE_MISSING' }),
        expect.objectContaining({ code: 'FILL_BLANK_ANSWER_MISSING' }),
        expect.objectContaining({ code: 'FILL_BLANK_HAS_OPTIONS' }),
      ]),
    );
  });

  it('validates option count, correctness, text, and display order', () => {
    const snapshot = validSnapshot();
    const question = snapshot.questions[0];
    question.options = [
      {
        id: 'only-option',
        optionText: ' ',
        isCorrect: false,
        displayOrder: 0,
      },
    ];

    expect(service.validateForPublication(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OPTION_COUNT_INVALID' }),
        expect.objectContaining({ code: 'CORRECT_OPTION_COUNT_INVALID' }),
        expect.objectContaining({ code: 'OPTION_TEXT_BLANK' }),
        expect.objectContaining({ code: 'OPTION_DISPLAY_ORDER_INVALID' }),
      ]),
    );
  });

  it('rejects multiple correct options', async () => {
    const snapshot = validSnapshot();
    snapshot.questions[0].options[1].isCorrect = true;
    repository.findPublicationSnapshot.mockResolvedValue(snapshot);

    await expect(service.publish('admin', 'quiz-id')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it.each([QuizStatus.DRAFT, QuizStatus.PUBLISHED])(
    'archives a %s quiz without changing publishedAt',
    async (status) => {
      const publishedAt = status === QuizStatus.PUBLISHED ? new Date() : null;
      repository.findQuizLifecycleState.mockResolvedValue({
        id: 'quiz-id',
        status,
        publishedAt,
        reviewSessionCount: 1,
      });
      repository.transitionQuizStatus.mockResolvedValue({
        id: 'quiz-id',
        status: QuizStatus.ARCHIVED,
        publishedAt,
      });

      await expect(service.archive('jwt-admin', 'quiz-id')).resolves.toEqual({
        id: 'quiz-id',
        status: QuizStatus.ARCHIVED,
      });
      expect(repository.transitionQuizStatus).toHaveBeenCalledWith({
        quizId: 'quiz-id',
        expectedStatus: status,
        status: QuizStatus.ARCHIVED,
        updatedByUserId: 'jwt-admin',
      });
    },
  );

  it('rejects archiving an already archived quiz', async () => {
    repository.findQuizLifecycleState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.ARCHIVED,
      publishedAt: new Date(),
      reviewSessionCount: 0,
    });

    await expect(service.archive('admin', 'quiz-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns 404 when an archive target is missing', async () => {
    repository.findQuizLifecycleState.mockResolvedValue(null);

    await expect(service.archive('admin', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restores only an unused archived quiz and clears publishedAt', async () => {
    repository.findQuizLifecycleState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.ARCHIVED,
      publishedAt: new Date(),
      reviewSessionCount: 0,
    });
    repository.transitionQuizStatus.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.DRAFT,
      publishedAt: null,
    });

    await expect(service.restoreDraft('jwt-admin', 'quiz-id')).resolves.toEqual(
      {
        id: 'quiz-id',
        status: QuizStatus.DRAFT,
      },
    );
    expect(repository.transitionQuizStatus).toHaveBeenCalledWith({
      quizId: 'quiz-id',
      expectedStatus: QuizStatus.ARCHIVED,
      status: QuizStatus.DRAFT,
      publishedAt: null,
      requireNoReviewSessions: true,
      updatedByUserId: 'jwt-admin',
    });
  });

  it('keeps a used archived quiz immutable', async () => {
    repository.findQuizLifecycleState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.ARCHIVED,
      publishedAt: new Date(),
      reviewSessionCount: 1,
    });

    await expect(
      service.restoreDraft('admin', 'quiz-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.transitionQuizStatus).not.toHaveBeenCalled();
  });

  it.each([QuizStatus.DRAFT, QuizStatus.PUBLISHED])(
    'rejects restoring a %s quiz',
    async (status) => {
      repository.findQuizLifecycleState.mockResolvedValue({
        id: 'quiz-id',
        status,
        publishedAt: status === QuizStatus.PUBLISHED ? new Date() : null,
        reviewSessionCount: 0,
      });

      await expect(
        service.restoreDraft('admin', 'quiz-id'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.transitionQuizStatus).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when a restore target is missing', async () => {
    repository.findQuizLifecycleState.mockResolvedValue(null);

    await expect(
      service.restoreDraft('admin', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps conditional transition races to 409', async () => {
    repository.findQuizLifecycleState.mockResolvedValue({
      id: 'quiz-id',
      status: QuizStatus.PUBLISHED,
      publishedAt: new Date(),
      reviewSessionCount: 0,
    });
    repository.transitionQuizStatus.mockRejectedValue(
      new QuizStatusTransitionConflictError(),
    );

    await expect(service.archive('admin', 'quiz-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
