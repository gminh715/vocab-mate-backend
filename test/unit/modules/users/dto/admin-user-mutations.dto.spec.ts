import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserRoleDto } from '../../../../../src/modules/users/dto/update-user-role.dto';
import { UpdateUserStatusDto } from '../../../../../src/modules/users/dto/update-user-status.dto';

const validateDto = <T extends object>(type: new () => T, input: object) =>
  validate(plainToInstance(type, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('Admin user mutation DTOs', () => {
  it.each(['ACTIVE', 'SUSPENDED', 'DISABLED'])(
    'accepts the %s user status',
    async (status) => {
      await expect(
        validateDto(UpdateUserStatusDto, { status }),
      ).resolves.toHaveLength(0);
    },
  );

  it('rejects an invalid user status', async () => {
    await expect(
      validateDto(UpdateUserStatusDto, { status: 'DELETED' }),
    ).resolves.not.toHaveLength(0);
  });

  it.each(['USER', 'ADMIN'])('accepts the %s user role', async (role) => {
    await expect(
      validateDto(UpdateUserRoleDto, { role }),
    ).resolves.toHaveLength(0);
  });

  it('rejects an invalid user role', async () => {
    await expect(
      validateDto(UpdateUserRoleDto, { role: 'OWNER' }),
    ).resolves.not.toHaveLength(0);
  });
});
