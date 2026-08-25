import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetReviewHistoryQueryDto,
  ReviewPreparationParamsDto,
  StartReviewSessionDto,
  SubmitReviewAnswerDto,
} from '../../../../../src/modules/reviews/dto/review-request.dto';
import { ReviewGoal } from '../../../../../generated/prisma/enums';

const QUESTION_ID = '11111111-1111-4111-8111-111111111111';

describe('Review request DTOs', () => {
  it('accepts only UUID preparation identifiers', async () => {
    const valid = plainToInstance(StartReviewSessionDto, {
      preparationId: QUESTION_ID,
      reviewGoal: ReviewGoal.BALANCED,
    });
    const invalid = plainToInstance(ReviewPreparationParamsDto, {
      preparationId: 'not-a-uuid',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
  });

  it.each([5, 10, 15])(
    'accepts the %i-minute daily plan contract',
    async (targetDurationMinutes) => {
      const dto = plainToInstance(StartReviewSessionDto, {
        targetDurationMinutes,
        reviewGoal: ReviewGoal.SPELLING,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects unsupported duration and goal values', async () => {
    const dto = plainToInstance(StartReviewSessionDto, {
      targetDurationMinutes: 7,
      reviewGoal: 'GRAMMAR',
    });

    expect((await validate(dto)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['targetDurationMinutes', 'reviewGoal']),
    );
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
      reviewQuestionId: QUESTION_ID,
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
      reviewQuestionId: QUESTION_ID,
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
