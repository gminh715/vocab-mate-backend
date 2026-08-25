import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GetVocabulariesQueryDto,
  SaveVocabularyDto,
  VocabularySort,
} from '../../../../../src/modules/vocabularies/dto/vocabulary-request.dto';

const TERM_ID = '11111111-1111-4111-8111-111111111111';
const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';

describe('Vocabulary request DTOs', () => {
  it('normalizes list search and parses dueOnly as a boolean', async () => {
    const dto = plainToInstance(GetVocabulariesQueryDto, {
      page: '2',
      limit: '10',
      q: '  harmful  ',
      dueOnly: 'true',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 10,
      q: 'harmful',
      dueOnly: true,
      sort: VocabularySort.NEWEST,
    });
  });

  it('rejects non-boolean dueOnly values and non-allowlisted sorting', async () => {
    const dto = plainToInstance(GetVocabulariesQueryDto, {
      page: 1,
      limit: 20,
      dueOnly: 'yes',
      sort: 'savedWordDisplay',
    });

    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['dueOnly', 'sort']),
    );
  });

  it('requires at least one collection UUID and trims collection identifiers', async () => {
    const dto = plainToInstance(SaveVocabularyDto, {
      articleSentenceTermId: TERM_ID,
      collectionIds: [` ${COLLECTION_ID} `, COLLECTION_ID],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.collectionIds).toEqual([COLLECTION_ID, COLLECTION_ID]);

    const invalid = plainToInstance(SaveVocabularyDto, {
      articleSentenceTermId: TERM_ID,
      collectionIds: COLLECTION_ID,
    });
    await expect(validate(invalid)).resolves.not.toHaveLength(0);

    for (const collectionIds of [undefined, []]) {
      const withoutCollection = plainToInstance(SaveVocabularyDto, {
        articleSentenceTermId: TERM_ID,
        ...(collectionIds === undefined ? {} : { collectionIds }),
      });
      const errors = await validate(withoutCollection);
      expect(errors.map(({ property }) => property)).toContain('collectionIds');
    }
  });

  it('rejects client-controlled snapshot and scheduling fields', async () => {
    const injected = plainToInstance(SaveVocabularyDto, {
      articleSentenceTermId: TERM_ID,
      collectionIds: [COLLECTION_ID],
      learningStatus: 'MASTERED',
      savedMeaningVi: 'client value',
      nextReviewAt: new Date().toISOString(),
      unexpectedField: 'client value',
    });
    const errors = await validate(injected, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map(({ property }) => property).sort()).toEqual([
      'learningStatus',
      'nextReviewAt',
      'savedMeaningVi',
      'unexpectedField',
    ]);
  });
});
