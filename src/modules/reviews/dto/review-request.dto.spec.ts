import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetReviewHistoryQueryDto,
  SubmitReviewAnswerDto,
} from './review-request.dto';

const QUESTION_ID = '11111111-1111-4111-8111-111111111111';

describe('Review request DTOs', () => {
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

  it('rejects negative response time and client attempt numbers other than one', async () => {
    const dto = plainToInstance(SubmitReviewAnswerDto, {
      quizQuestionId: QUESTION_ID,
      selectedOptionId: QUESTION_ID,
      responseTimeMs: -1,
      attemptNumber: 2,
    });
    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['responseTimeMs', 'attemptNumber']),
    );
  });
});
