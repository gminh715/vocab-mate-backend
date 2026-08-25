import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminUserSort } from '../../../../src/modules/users/dto/admin-user-list-query.dto';
import type { AdminUserDetailRecord } from '../../../../src/modules/users/repositories/users.repository';
import {
  ConcurrentAdminMutationError,
  UsersRepository,
} from '../../../../src/modules/users/repositories/users.repository';
import { AdminService } from '../../../../src/modules/users/services/admin.service';

describe('AdminService', () => {
  const repository = {
    findAdminUsers: jest.fn(),
    findAdminUserDetail: jest.fn(),
    updateAdminUserStatus: jest.fn(),
    updateAdminUserRole: jest.fn(),
  };
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: UsersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('maps repository totals to pagination metadata', async () => {
    repository.findAdminUsers.mockResolvedValue({ items: [], total: 41 });
    const query = {
      page: 2,
      limit: 20,
      sort: AdminUserSort.NEWEST,
    };

    await expect(service.findAll(query)).resolves.toEqual({
      items: [],
      meta: { page: 2, limit: 20, total: 41, totalPages: 3 },
    });
    expect(repository.findAdminUsers).toHaveBeenCalledWith(query);
  });

  it('returns the lightweight learning summary unchanged', async () => {
    const detail: AdminUserDetailRecord = {
      user: {
        id: 'user-id',
        email: 'user@example.com',
        role: 'USER',
        status: 'ACTIVE',
        lastLoginAt: null,
        createdAt: new Date('2026-07-22T10:00:00Z'),
      },
      profile: null,
      learningSummary: {
        savedVocabularyCount: 12,
        masteredVocabularyCount: 4,
        completedArticleCount: 3,
      },
    };
    repository.findAdminUserDetail.mockResolvedValue(detail);

    await expect(service.findOne('user-id')).resolves.toEqual(detail);
  });

  it('maps a missing user to NotFoundException', async () => {
    repository.findAdminUserDetail.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['SUSPENDED', 'DISABLED', 'ACTIVE'] as const)(
    'returns the safe result when status changes to %s',
    async (status) => {
      const user = {
        id: 'target-id',
        status,
        updatedAt: new Date('2026-07-22T10:00:00Z'),
      };
      repository.updateAdminUserStatus.mockResolvedValue({
        outcome: 'success',
        user,
      });

      await expect(
        service.updateStatus('acting-admin-id', 'target-id', { status }),
      ).resolves.toEqual(user);
      expect(repository.updateAdminUserStatus).toHaveBeenCalledWith(
        'target-id',
        status,
      );
    },
  );

  it.each(['SUSPENDED', 'DISABLED'] as const)(
    'rejects an administrator changing their own status to %s',
    async (status) => {
      await expect(
        service.updateStatus('admin-id', 'admin-id', { status }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.updateAdminUserStatus).not.toHaveBeenCalled();
    },
  );

  it('returns the current account for an idempotent same-status request', async () => {
    const user = {
      id: 'target-id',
      status: 'ACTIVE' as const,
      updatedAt: new Date('2026-07-22T10:00:00Z'),
    };
    repository.updateAdminUserStatus.mockResolvedValue({
      outcome: 'success',
      user,
    });

    await expect(
      service.updateStatus('acting-admin-id', 'target-id', {
        status: 'ACTIVE',
      }),
    ).resolves.toEqual(user);
  });

  it.each([
    ['status', 'updateAdminUserStatus'],
    ['role', 'updateAdminUserRole'],
  ] as const)(
    'maps a missing %s target to NotFoundException',
    async (_, key) => {
      repository[key].mockResolvedValue({ outcome: 'not_found' });

      const operation =
        key === 'updateAdminUserStatus'
          ? service.updateStatus('admin-id', 'missing-id', { status: 'ACTIVE' })
          : service.updateRole('admin-id', 'missing-id', { role: 'ADMIN' });

      await expect(operation).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each([
    ['status', 'updateAdminUserStatus'],
    ['role', 'updateAdminUserRole'],
  ] as const)(
    'maps the last-active-admin %s invariant to ConflictException',
    async (_, key) => {
      repository[key].mockResolvedValue({ outcome: 'last_active_admin' });

      const operation =
        key === 'updateAdminUserStatus'
          ? service.updateStatus('acting-id', 'target-id', {
              status: 'DISABLED',
            })
          : service.updateRole('acting-id', 'target-id', { role: 'USER' });

      await expect(operation).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('promotes a USER to ADMIN and demotes an ADMIN when allowed', async () => {
    const updatedAt = new Date('2026-07-22T10:00:00Z');
    repository.updateAdminUserRole
      .mockResolvedValueOnce({
        outcome: 'success',
        user: { id: 'target-id', role: 'ADMIN', updatedAt },
      })
      .mockResolvedValueOnce({
        outcome: 'success',
        user: { id: 'target-id', role: 'USER', updatedAt },
      });

    await expect(
      service.updateRole('acting-id', 'target-id', { role: 'ADMIN' }),
    ).resolves.toMatchObject({ role: 'ADMIN' });
    await expect(
      service.updateRole('acting-id', 'target-id', { role: 'USER' }),
    ).resolves.toMatchObject({ role: 'USER' });
  });

  it('rejects self-demotion without calling the repository', async () => {
    await expect(
      service.updateRole('admin-id', 'admin-id', { role: 'USER' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateAdminUserRole).not.toHaveBeenCalled();
  });

  it('maps exhausted serialization retries to ConflictException', async () => {
    repository.updateAdminUserRole.mockRejectedValue(
      new ConcurrentAdminMutationError(),
    );

    await expect(
      service.updateRole('acting-id', 'target-id', { role: 'USER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
