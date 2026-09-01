import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminUserListQueryDto,
  AdminUserSort,
} from '../../../../../src/modules/users/dto/admin-user-list-query.dto';

const transformAndValidate = async (input: object) => {
  const dto = plainToInstance(AdminUserListQueryDto, input);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
};

describe('AdminUserListQueryDto', () => {
  it('converts pagination, trims q, and defaults to newest sorting', async () => {
    const { dto, errors } = await transformAndValidate({
      page: '2',
      limit: '20',
      q: '  Nguyen  ',
      role: 'USER',
      status: 'ACTIVE',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 20,
      q: 'Nguyen',
      role: 'USER',
      status: 'ACTIVE',
      sort: AdminUserSort.NEWEST,
    });
  });

  it.each([
    ['page below one', { page: 0, limit: 20 }],
    ['limit below one', { page: 1, limit: 0 }],
    ['limit above maximum', { page: 1, limit: 101 }],
    ['invalid role', { page: 1, limit: 20, role: 'OWNER' }],
    ['invalid status', { page: 1, limit: 20, status: 'DELETED' }],
    ['unsupported sort', { page: 1, limit: 20, sort: 'email' }],
    ['blank search', { page: 1, limit: 20, q: '   ' }],
  ])('rejects %s', async (_case, input) => {
    const { errors } = await transformAndValidate(input);
    expect(errors).not.toHaveLength(0);
  });
});
