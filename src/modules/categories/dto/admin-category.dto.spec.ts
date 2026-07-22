import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminCategoryListQueryDto,
  AdminCategoryParamsDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './admin-category.dto';

const transformAndValidate = async <T extends object>(
  type: new () => T,
  input: object,
) => {
  const dto = plainToInstance(type, input);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
};

describe('admin category DTOs', () => {
  it('maps pagination, trims q, and transforms false correctly', async () => {
    const { dto, errors } = await transformAndValidate(
      AdminCategoryListQueryDto,
      { page: '2', limit: '20', q: '  tech  ', isActive: 'false' },
    );

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 20,
      q: 'tech',
      isActive: false,
    });
  });

  it.each([
    ['page below one', { page: 0, limit: 20 }],
    ['limit above maximum', { page: 1, limit: 101 }],
    ['blank search', { page: 1, limit: 20, q: '   ' }],
    ['invalid boolean', { page: 1, limit: 20, isActive: 'yes' }],
  ])('rejects admin list %s', async (_case, input) => {
    const { errors } = await transformAndValidate(
      AdminCategoryListQueryDto,
      input,
    );
    expect(errors).not.toHaveLength(0);
  });

  it('normalizes valid create input', async () => {
    const { dto, errors } = await transformAndValidate(CreateCategoryDto, {
      name: '  Technology  ',
      slug: '  TECHNOLOGY  ',
      description: '  Articles  ',
      isActive: false,
      displayOrder: 2,
    });

    expect(errors).toHaveLength(0);
    expect(dto).toEqual({
      name: 'Technology',
      slug: 'technology',
      description: 'Articles',
      isActive: false,
      displayOrder: 2,
    });
  });

  it.each([
    ['blank name', { name: ' ', slug: 'technology' }],
    ['invalid slug', { name: 'Technology', slug: 'not_valid' }],
    [
      'negative order',
      { name: 'Technology', slug: 'technology', displayOrder: -1 },
    ],
    [
      'client audit ID',
      { name: 'Technology', slug: 'technology', createdByUserId: 'admin-id' },
    ],
  ])('rejects create %s', async (_case, input) => {
    const { errors } = await transformAndValidate(CreateCategoryDto, input);
    expect(errors).not.toHaveLength(0);
  });

  it('allows only documented partial update fields', async () => {
    const valid = await transformAndValidate(UpdateCategoryDto, {
      slug: '  TECHNOLOGY  ',
    });
    const statusAttempt = await transformAndValidate(UpdateCategoryDto, {
      isActive: false,
    });

    expect(valid.errors).toHaveLength(0);
    expect(valid.dto.slug).toBe('technology');
    expect(statusAttempt.errors).not.toHaveLength(0);
  });

  it('validates category IDs as UUIDs', async () => {
    const invalid = await transformAndValidate(AdminCategoryParamsDto, {
      categoryId: 'not-a-uuid',
    });
    expect(invalid.errors).not.toHaveLength(0);
  });

  it('accepts only a required boolean status', async () => {
    const valid = await transformAndValidate(UpdateCategoryStatusDto, {
      isActive: false,
    });
    const missing = await transformAndValidate(UpdateCategoryStatusDto, {});
    const stringValue = await transformAndValidate(UpdateCategoryStatusDto, {
      isActive: 'false',
    });
    const unknown = await transformAndValidate(UpdateCategoryStatusDto, {
      isActive: true,
      updatedByUserId: 'client-value',
    });

    expect(valid.errors).toHaveLength(0);
    expect(missing.errors).not.toHaveLength(0);
    expect(stringValue.errors).not.toHaveLength(0);
    expect(unknown.errors).not.toHaveLength(0);
  });
});
