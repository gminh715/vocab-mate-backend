import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ReadingHistoryQueryDto,
  UpdateReadingProgressDto,
} from './reading-response.dto';

describe('Reading DTO validation', () => {
  it.each([0, 35.5, 100])('accepts progressPercent %s', async (value) => {
    const dto = plainToInstance(UpdateReadingProgressDto, {
      progressPercent: value,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([-0.01, 100.01, 12.345, '60'])(
    'rejects invalid progressPercent %s',
    async (value) => {
      const dto = plainToInstance(UpdateReadingProgressDto, {
        progressPercent: value,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('trims a valid opaque lastBlockKey and rejects a blank key', async () => {
    const valid = plainToInstance(UpdateReadingProgressDto, {
      lastBlockKey: '  paragraph-3  ',
    });
    const blank = plainToInstance(UpdateReadingProgressDto, {
      lastBlockKey: '   ',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.lastBlockKey).toBe('paragraph-3');
    expect(await validate(blank)).not.toHaveLength(0);
  });

  it('validates bounded history pagination and allowlisted filters', async () => {
    const valid = plainToInstance(ReadingHistoryQueryDto, {
      page: '1',
      limit: '20',
      status: 'COMPLETED',
      sort: 'oldest',
    });
    const invalid = plainToInstance(ReadingHistoryQueryDto, {
      page: 0,
      limit: 101,
      status: 'IN_PROGRESS',
      sort: 'recent',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({
      page: 1,
      limit: 20,
      status: 'COMPLETED',
      sort: 'oldest',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
