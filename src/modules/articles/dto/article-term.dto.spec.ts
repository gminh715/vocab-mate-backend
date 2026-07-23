import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateArticleTermDto, UpdateArticleTermDto } from './article-term.dto';

const validTerm = {
  value: 'digital tools',
  wordDisplay: 'digital tools',
  lemma: 'digital tool',
  normalizedLemma: 'digital tool',
  unitType: 'PHRASE',
  partOfSpeech: 'noun phrase',
  cefrLevel: 'B1',
  contextualMeaningVi: 'công cụ số',
};

describe('article term DTOs', () => {
  it('trims valid arrays and documented example objects', async () => {
    const dto = plainToInstance(CreateArticleTermDto, {
      ...validTerm,
      synonyms: [' resource '],
      examples: [{ sentence: ' Example. ', translationVi: ' Ví dụ. ' }],
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.synonyms).toEqual(['resource']);
    expect(dto.examples).toEqual([
      { sentence: 'Example.', translationVi: 'Ví dụ.' },
    ]);
  });

  it('rejects blank array entries and malformed examples', async () => {
    const dto = plainToInstance(CreateArticleTermDto, {
      ...validTerm,
      synonyms: ['   '],
      examples: [{ sentence: 'Example.' }],
    });

    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['synonyms', 'examples']),
    );
  });

  it('allows a partial update while rejecting blank supplied strings', async () => {
    await expect(
      validate(plainToInstance(UpdateArticleTermDto, { isActive: false })),
    ).resolves.toEqual([]);
    const errors = await validate(
      plainToInstance(UpdateArticleTermDto, { definitionEn: '   ' }),
    );
    expect(errors.map(({ property }) => property)).toContain('definitionEn');
  });
});
