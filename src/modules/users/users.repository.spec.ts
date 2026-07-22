import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import {
  ConcurrentAdminMutationError,
  UsersRepository,
} from './users.repository';

describe('UsersRepository', () => {
  const findUnique: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const profileUpdate: jest.MockedFunction<
    (query: object) => Promise<unknown>
  > = jest.fn();
  const userUpdate: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const findMany: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const userCount: jest.MockedFunction<(query: object) => Promise<unknown>> =
    jest.fn();
  const vocabularyCount: jest.MockedFunction<
    (query: object) => Promise<unknown>
  > = jest.fn();
  const articleProgressCount: jest.MockedFunction<
    (query: object) => Promise<unknown>
  > = jest.fn();
  type TransactionCallback = (client: {
    user: {
      findUnique: typeof findUnique;
      update: typeof userUpdate;
      count: typeof userCount;
    };
  }) => Promise<unknown>;
  const transaction = jest.fn(
    (input: Promise<unknown>[] | TransactionCallback): Promise<unknown> =>
      typeof input === 'function'
        ? input({
            user: { findUnique, update: userUpdate, count: userCount },
          })
        : Promise.all(input),
  );
  let repository: UsersRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation(
      (input: Promise<unknown>[] | TransactionCallback): Promise<unknown> =>
        typeof input === 'function'
          ? input({
              user: { findUnique, update: userUpdate, count: userCount },
            })
          : Promise.all(input),
    );
    findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([]);
    userCount.mockResolvedValue(0);
    vocabularyCount.mockResolvedValue(0);
    articleProgressCount.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersRepository,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique,
              findMany,
              update: userUpdate,
              count: userCount,
            },
            userProfile: { update: profileUpdate },
            userVocabulary: { count: vocabularyCount },
            userArticleProgress: { count: articleProgressCount },
            $transaction: transaction,
          },
        },
      ],
    }).compile();

    repository = module.get(UsersRepository);
  });

  it('selects only safe account and profile fields', async () => {
    findUnique.mockResolvedValue(null);

    await repository.findMyAccount('user-id');

    const query = findUnique.mock.calls[0][0];
    expect(query).toEqual({
      where: { id: 'user-id' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        profile: {
          select: {
            displayName: true,
            avatarUrl: true,
            currentCefrLevel: true,
            learningGoal: true,
            preferredLanguage: true,
          },
        },
      },
    });
    expect(JSON.stringify(query)).not.toContain('passwordHash');
  });

  it('scopes a partial profile update by userId and returns a safe projection', async () => {
    profileUpdate.mockResolvedValue({
      displayName: 'Updated Name',
      avatarUrl: null,
      currentCefrLevel: 'B1',
      learningGoal: null,
      preferredLanguage: 'vi',
      user: {
        id: 'user-id',
        email: 'user@example.com',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    const result = await repository.updateMyProfile('user-id', {
      displayName: 'Updated Name',
    });

    const query = profileUpdate.mock.calls[0][0];
    expect(query).toMatchObject({
      where: { userId: 'user-id' },
      data: { displayName: 'Updated Name' },
    });
    expect(JSON.stringify(query)).not.toContain('passwordHash');
    expect(result).toEqual({
      user: {
        id: 'user-id',
        email: 'user@example.com',
        role: 'USER',
        status: 'ACTIVE',
      },
      profile: {
        displayName: 'Updated Name',
        avatarUrl: null,
        currentCefrLevel: 'B1',
        learningGoal: null,
        preferredLanguage: 'vi',
      },
    });
  });

  it('applies combined filters, email/display-name search, stable pagination, and safe projection', async () => {
    findMany.mockResolvedValue([]);
    userCount.mockResolvedValue(25);

    await expect(
      repository.findAdminUsers({
        page: 2,
        limit: 10,
        q: 'nguyen',
        role: 'USER',
        status: 'ACTIVE',
        sort: 'oldest',
      }),
    ).resolves.toEqual({ items: [], total: 25 });

    const pageQuery = findMany.mock.calls[0][0];
    const countQuery = userCount.mock.calls[0][0];
    expect(pageQuery).toMatchObject({
      where: {
        role: 'USER',
        status: 'ACTIVE',
        OR: [
          { email: { contains: 'nguyen', mode: 'insensitive' } },
          {
            profile: {
              is: {
                displayName: {
                  contains: 'nguyen',
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const pageWhere = (pageQuery as { where: unknown }).where;
    expect(countQuery).toEqual({ where: pageWhere });
    expect(JSON.stringify(pageQuery)).not.toContain('passwordHash');
  });

  it('maps allowlisted newest sorting to a deterministic order', async () => {
    await repository.findAdminUsers({
      page: 1,
      limit: 20,
      sort: 'newest',
    });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 0,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  });

  it('returns safe detail fields with lightweight aggregate counts', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: 'USER',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: new Date('2026-07-22T10:00:00Z'),
      profile: {
        displayName: 'Nguyen Van A',
        avatarUrl: null,
        currentCefrLevel: 'B1',
        learningGoal: null,
        preferredLanguage: 'vi',
      },
    });
    vocabularyCount.mockResolvedValueOnce(12).mockResolvedValueOnce(4);
    articleProgressCount.mockResolvedValue(3);

    const result = await repository.findAdminUserDetail('user-id');

    expect(result?.learningSummary).toEqual({
      savedVocabularyCount: 12,
      masteredVocabularyCount: 4,
      completedArticleCount: 3,
    });
    expect(vocabularyCount).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user-id' },
    });
    expect(vocabularyCount).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-id', learningStatus: 'MASTERED' },
    });
    expect(articleProgressCount).toHaveBeenCalledWith({
      where: { userId: 'user-id', status: 'COMPLETED' },
    });
    expect(JSON.stringify(findUnique.mock.calls[0][0])).not.toContain(
      'passwordHash',
    );
  });

  it('returns null when the admin detail user does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      repository.findAdminUserDetail('missing-id'),
    ).resolves.toBeNull();
  });

  it.each([
    ['ACTIVE', 'SUSPENDED'],
    ['ACTIVE', 'DISABLED'],
    ['SUSPENDED', 'ACTIVE'],
  ] as const)('safely changes status from %s to %s', async (from, to) => {
    const updatedAt = new Date('2026-07-22T10:00:00Z');
    findUnique.mockResolvedValue({
      id: 'user-id',
      role: 'USER',
      status: from,
      updatedAt,
    });
    userUpdate.mockResolvedValue({ id: 'user-id', status: to, updatedAt });

    await expect(
      repository.updateAdminUserStatus('user-id', to),
    ).resolves.toEqual({
      outcome: 'success',
      user: { id: 'user-id', status: to, updatedAt },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { status: to },
      select: { id: true, status: true, updatedAt: true },
    });
    expect(JSON.stringify(userUpdate.mock.calls[0][0])).not.toContain(
      'passwordHash',
    );
  });

  it('returns a same-status request without issuing an update', async () => {
    const updatedAt = new Date('2026-07-22T10:00:00Z');
    findUnique.mockResolvedValue({
      id: 'user-id',
      role: 'USER',
      status: 'ACTIVE',
      updatedAt,
    });

    await expect(
      repository.updateAdminUserStatus('user-id', 'ACTIVE'),
    ).resolves.toEqual({
      outcome: 'success',
      user: { id: 'user-id', status: 'ACTIVE', updatedAt },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'DISABLED'] as const)(
    'prevents changing the only active administrator to %s',
    async (status) => {
      findUnique.mockResolvedValue({
        id: 'admin-id',
        role: 'ADMIN',
        status: 'ACTIVE',
        updatedAt: new Date(),
      });
      userCount.mockResolvedValue(1);

      await expect(
        repository.updateAdminUserStatus('admin-id', status),
      ).resolves.toEqual({ outcome: 'last_active_admin' });
      expect(userCount).toHaveBeenCalledWith({
        where: { role: 'ADMIN', status: 'ACTIVE' },
      });
      expect(userUpdate).not.toHaveBeenCalled();
    },
  );

  it('promotes a disabled USER without counting it as an active administrator', async () => {
    const updatedAt = new Date('2026-07-22T10:00:00Z');
    findUnique.mockResolvedValue({
      id: 'user-id',
      role: 'USER',
      status: 'DISABLED',
      updatedAt,
    });
    userUpdate.mockResolvedValue({
      id: 'user-id',
      role: 'ADMIN',
      updatedAt,
    });

    await expect(
      repository.updateAdminUserRole('user-id', 'ADMIN'),
    ).resolves.toMatchObject({
      outcome: 'success',
      user: { role: 'ADMIN' },
    });
    expect(userCount).not.toHaveBeenCalled();
  });

  it('allows demotion when another active administrator exists', async () => {
    const updatedAt = new Date('2026-07-22T10:00:00Z');
    findUnique.mockResolvedValue({
      id: 'admin-id',
      role: 'ADMIN',
      status: 'ACTIVE',
      updatedAt,
    });
    userCount.mockResolvedValue(2);
    userUpdate.mockResolvedValue({
      id: 'admin-id',
      role: 'USER',
      updatedAt,
    });

    await expect(
      repository.updateAdminUserRole('admin-id', 'USER'),
    ).resolves.toMatchObject({
      outcome: 'success',
      user: { role: 'USER' },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'admin-id' },
      data: { role: 'USER' },
      select: { id: true, role: true, updatedAt: true },
    });
  });

  it('prevents demotion of the only active administrator', async () => {
    findUnique.mockResolvedValue({
      id: 'admin-id',
      role: 'ADMIN',
      status: 'ACTIVE',
      updatedAt: new Date(),
    });
    userCount.mockResolvedValue(1);

    await expect(
      repository.updateAdminUserRole('admin-id', 'USER'),
    ).resolves.toEqual({ outcome: 'last_active_admin' });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('does not count a disabled ADMIN when demoting it', async () => {
    findUnique.mockResolvedValue({
      id: 'admin-id',
      role: 'ADMIN',
      status: 'DISABLED',
      updatedAt: new Date(),
    });
    userUpdate.mockResolvedValue({
      id: 'admin-id',
      role: 'USER',
      updatedAt: new Date(),
    });

    await repository.updateAdminUserRole('admin-id', 'USER');

    expect(userCount).not.toHaveBeenCalled();
  });

  it.each(['status', 'role'] as const)(
    'returns not_found without mutating the missing %s target',
    async (mutation) => {
      findUnique.mockResolvedValue(null);

      const result =
        mutation === 'status'
          ? repository.updateAdminUserStatus('missing-id', 'DISABLED')
          : repository.updateAdminUserRole('missing-id', 'ADMIN');

      await expect(result).resolves.toEqual({ outcome: 'not_found' });
      expect(userUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(['status', 'role'] as const)(
    'retries a concurrent %s removal and re-checks the active-admin invariant',
    async (mutation) => {
      transaction
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(
          (input: Promise<unknown>[] | TransactionCallback) =>
            typeof input === 'function'
              ? input({
                  user: {
                    findUnique,
                    update: userUpdate,
                    count: userCount,
                  },
                })
              : Promise.all(input),
        );
      findUnique.mockResolvedValue({
        id: 'admin-id',
        role: 'ADMIN',
        status: 'ACTIVE',
        updatedAt: new Date(),
      });
      userCount.mockResolvedValue(1);

      const result =
        mutation === 'status'
          ? repository.updateAdminUserStatus('admin-id', 'DISABLED')
          : repository.updateAdminUserRole('admin-id', 'USER');

      await expect(result).resolves.toEqual({
        outcome: 'last_active_admin',
      });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(userUpdate).not.toHaveBeenCalled();
    },
  );

  it('bounds serialization retries and reports concurrent contention', async () => {
    transaction.mockRejectedValue({ code: 'P2034' });

    await expect(
      repository.updateAdminUserRole('admin-id', 'USER'),
    ).rejects.toBeInstanceOf(ConcurrentAdminMutationError);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
