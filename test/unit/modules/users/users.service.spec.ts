import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  MyAccountRecord,
  UpdatedMyProfileRecord,
} from '../../../../src/modules/users/repositories/users.repository';
import { UsersRepository } from '../../../../src/modules/users/repositories/users.repository';
import { UsersService } from '../../../../src/modules/users/services/users.service';

const account: MyAccountRecord = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  role: 'USER',
  status: 'ACTIVE',
  displayName: 'Nguyen Van A',
  avatarUrl: null,
  currentCefrLevel: 'B1',
  learningGoal: 'B2',
  preferredLanguage: 'vi',
};

interface UsersRepositoryMock {
  createRegisteredUser: jest.Mock;
  findMyAccount: jest.Mock;
  updateMyProfile: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let repository: UsersRepositoryMock;

  beforeEach(async () => {
    repository = {
      createRegisteredUser: jest.fn(),
      findMyAccount: jest.fn(),
      updateMyProfile: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('returns the current safe account and learning settings', async () => {
    repository.findMyAccount.mockResolvedValue(account);

    await expect(service.getMe(account.id)).resolves.toEqual(account);
    expect(repository.findMyAccount).toHaveBeenCalledWith(account.id);
    expect(account).not.toHaveProperty('passwordHash');
  });

  it('returns NotFoundException for a missing user', async () => {
    repository.findMyAccount.mockResolvedValue(null);

    await expect(service.getMe(account.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates only the supplied learning-setting fields for the authenticated user', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    const dto = {
      displayName: 'Updated Name',
      currentCefrLevel: 'B2' as const,
      learningGoal: 'C1' as const,
    };
    const updated: UpdatedMyProfileRecord = { ...account, ...dto };
    repository.updateMyProfile.mockResolvedValue(updated);

    await expect(service.updateMe(account.id, dto)).resolves.toEqual(updated);
    expect(repository.updateMyProfile).toHaveBeenCalledWith(account.id, dto);
  });

  it('preserves an existing free-text learning goal during other setting updates', async () => {
    const freeTextAccount = {
      ...account,
      learningGoal: 'Learn 10 useful words each day',
    };
    const updated: UpdatedMyProfileRecord = {
      ...freeTextAccount,
      displayName: 'Updated Name',
    };
    repository.findMyAccount.mockResolvedValue(freeTextAccount);
    repository.updateMyProfile.mockResolvedValue(updated);

    await expect(
      service.updateMe(account.id, { displayName: 'Updated Name' }),
    ).resolves.toEqual(updated);
    expect(repository.updateMyProfile).toHaveBeenCalledWith(account.id, {
      displayName: 'Updated Name',
    });
  });

  it('rejects a learning goal lower than the current CEFR level', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    const dto = {
      learningGoal: 'A2' as const, // account has currentCefrLevel: 'B1'
    };

    await expect(service.updateMe(account.id, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.updateMyProfile).not.toHaveBeenCalled();
  });

  it('rejects an empty PATCH', async () => {
    await expect(service.updateMe(account.id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.updateMyProfile).not.toHaveBeenCalled();
  });

  it('maps a missing user update to NotFoundException', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    repository.updateMyProfile.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' }),
    );

    await expect(
      service.updateMe(account.id, { displayName: 'Updated Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps Prisma unique-constraint errors to ConflictException', async () => {
    repository.createRegisteredUser.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'P2002' }),
    );

    await expect(
      service.createRegisteredUser({
        email: 'user@example.com',
        passwordHash: 'hash',
        displayName: 'User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
