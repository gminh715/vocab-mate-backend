import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetReviewHistoryQueryDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from './review-request.dto';
import { ReviewSessionType } from '../../../../generated/prisma/enums';

const QUESTION_ID = '11111111-1111-4111-8111-111111111111';

describe('Review request DTOs', () => {
  it.each([
    [ReviewSessionType.DAILY_REVIEW, {}],
    [ReviewSessionType.QUIZ, { quizId: QUESTION_ID }],
    [ReviewSessionType.ARTICLE_REVIEW, { articleId: QUESTION_ID }],
    [ReviewSessionType.COLLECTION_REVIEW, { collectionId: QUESTION_ID }],
  ])('accepts the valid %s source shape', async (sessionType, source) => {
    const dto = plainToInstance(StartReviewSessionDto, {
      sessionType,
      ...source,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires the identifier belonging to the selected source type', async () => {
    const dto = plainToInstance(StartReviewSessionDto, {
      sessionType: ReviewSessionType.COLLECTION_REVIEW,
    });
    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'collectionId',
    );
  });

  it('accepts explicit null identifiers for an unscoped daily review', async () => {
    const dto = plainToInstance(StartReviewSessionDto, {
      sessionType: ReviewSessionType.DAILY_REVIEW,
      limit: 15,
      articleId: null,
      collectionId: null,
      quizId: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('parses pagination and accepts offset-aware ISO timestamps', async () => {
    const dto = plainToInstance(GetReviewHistoryQueryDto, {
      page: '2',
      limit: '10',
      from: '2026-07-24T01:00:00+07:00',
      to: '2026-07-25T00:00:00Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 10 });
  });

  it('rejects local or malformed history timestamps', async () => {
    const local = plainToInstance(GetReviewHistoryQueryDto, {
      from: '2026-07-24T01:00:00',
    });
    const malformed = plainToInstance(GetReviewHistoryQueryDto, {
      to: 'not-a-date',
    });

    await expect(validate(local)).resolves.not.toHaveLength(0);
    await expect(validate(malformed)).resolves.not.toHaveLength(0);
  });

  it('rejects negative response time and hint counts', async () => {
    const dto = plainToInstance(SubmitReviewAnswerDto, {
      reviewSessionItemId: QUESTION_ID,
      quizQuestionId: QUESTION_ID,
      selectedOptionId: QUESTION_ID,
      responseTimeMs: -1,
      hintsUsed: -1,
    });
    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['responseTimeMs', 'hintsUsed']),
    );
  });

  it('rejects client-controlled attempt numbers through whitelist validation', async () => {
    const dto = plainToInstance(SubmitReviewAnswerDto, {
      reviewSessionItemId: QUESTION_ID,
      quizQuestionId: QUESTION_ID,
      selectedOptionId: QUESTION_ID,
      attemptNumber: 2,
    });

    expect(
      (
        await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
      ).map(({ property }) => property),
    ).toContain('attemptNumber');
  });
});
