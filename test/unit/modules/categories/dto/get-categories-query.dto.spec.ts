import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CategorySlugParamsDto,
  GetCategoriesQueryDto,
} from '../../../../../src/modules/categories/dto/get-categories-query.dto';

describe('category request DTOs', () => {
  it('trims a valid search query', async () => {
    const dto = plainToInstance(GetCategoriesQueryDto, {
      q: '  technology  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.q).toBe('technology');
  });

  it.each([
    ['blank search', { q: '   ' }],
    ['overlong search', { q: 'a'.repeat(321) }],
    ['undocumented sort', { sort: 'name' }],
  ])('rejects %s', async (_case, input) => {
    const dto = plainToInstance(GetCategoriesQueryDto, input);

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('normalizes and validates a category slug', async () => {
    const dto = plainToInstance(CategorySlugParamsDto, {
      slug: '  Web-Development  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.slug).toBe('web-development');
  });

  it.each(['', 'not_valid', '-technology', 'technology-'])(
    'rejects invalid slug %p',
    async (slug) => {
      const dto = plainToInstance(CategorySlugParamsDto, { slug });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
