import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  MyAccountRecord,
  UpdatedMyProfileRecord,
} from './users.repository';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const account: MyAccountRecord & {
  profile: NonNullable<MyAccountRecord['profile']>;
} = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  role: 'USER',
  status: 'ACTIVE',
  profile: {
    displayName: 'Nguyen Van A',
    avatarUrl: null,
    currentCefrLevel: 'B1',
    learningGoal: 'B2',
    preferredLanguage: 'vi',
  },
};

interface UsersRepositoryMock {
  createWithProfile: jest.Mock;
  findMyAccount: jest.Mock;
  updateMyProfile: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let repository: UsersRepositoryMock;

  beforeEach(async () => {
    repository = {
      createWithProfile: jest.fn(),
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

  it('returns the current safe account and profile', async () => {
    repository.findMyAccount.mockResolvedValue(account);

    await expect(service.getMe(account.id)).resolves.toEqual(account);
    expect(repository.findMyAccount).toHaveBeenCalledWith(account.id);
    expect(account).not.toHaveProperty('passwordHash');
    expect(account.profile).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['missing user', null],
    ['missing profile', { ...account, profile: null }],
  ])('returns NotFoundException for a %s', async (_case, result) => {
    repository.findMyAccount.mockResolvedValue(result);

    await expect(service.getMe(account.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates only the supplied profile fields for the authenticated user', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    const dto = {
      displayName: 'Updated Name',
      currentCefrLevel: 'B2' as const,
      learningGoal: 'C1' as const,
    };
    const updated: UpdatedMyProfileRecord = {
      user: {
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
      },
      profile: { ...account.profile, ...dto },
    };
    repository.updateMyProfile.mockResolvedValue(updated);

    await expect(service.updateMe(account.id, dto)).resolves.toEqual(updated);
    expect(repository.updateMyProfile).toHaveBeenCalledWith(account.id, dto);
  });

  it('rejects a learning goal that is equal to or lower than current CEFR level', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    const dto = {
      learningGoal: 'B1' as const, // account has currentCefrLevel: 'B1'
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

  it('maps a missing profile update to NotFoundException', async () => {
    repository.findMyAccount.mockResolvedValue(account);
    repository.updateMyProfile.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' }),
    );

    await expect(
      service.updateMe(account.id, { displayName: 'Updated Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps Prisma unique-constraint errors to ConflictException', async () => {
    repository.createWithProfile.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'P2002' }),
    );

    await expect(
      service.createRegisteredUser({
        email: 'user@example.com',
        passwordHash: 'hash',
        displayName: 'User',
        currentCefrLevel: 'B1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
