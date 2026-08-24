import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { AuthenticatedUserThrottlerGuard } from '../../../src/common/guards/authenticated-user-throttler.guard';
import type { AuthConfig } from '../../../src/config/auth.config';
import { AUTH_CONFIG } from '../../../src/config/config.module';
import { PrismaService } from '../../../src/database/prisma.service';
import { ArticlesRepository } from '../../../src/modules/articles/repositories/articles.repository';
import {
  type AdminCategoryRecord,
  CategoriesRepository,
  type PublicCategoryRecord,
} from '../../../src/modules/categories/categories.repository';
import type {
  AdminUserDetailRecord,
  AdminUserListQuery,
  AdminUserListResult,
  AdminUserMutationResult,
  AuthUserRecord,
  CreateRegisteredUserInput,
  MyAccountRecord,
  PublicUserRecord,
  UpdatedMyProfileRecord,
  UpdatedAdminUserRoleRecord,
  UpdatedAdminUserStatusRecord,
  UpdateMyProfileInput,
  UserProfileRecord,
} from '../../../src/modules/users/users.repository';
import { UsersRepository } from '../../../src/modules/users/users.repository';
import { InMemoryCategoriesRepository } from '../../support/in-memory-categories.repository';
import { InMemoryArticlesRepository } from '../../support/in-memory-articles.repository';

const authConfig: AuthConfig = {
  accessSecret: 'e2e-access-secret-at-least-32-characters',
  accessExpiresInSeconds: 900,
  refreshSecret: 'e2e-refresh-secret-at-least-32-characters',
  refreshExpiresInSeconds: 604800,
  bcryptRounds: 4,
  cookieSecure: false,
  cookieSameSite: 'lax',
};

const registration = {
  email: 'user@example.com',
  password: 'StrongPass@123',
  displayName: 'Nguyen Van A',
};

interface RegistrationResponseBody {
  success: true;
  data: { user: PublicUserRecord };
}

interface AuthResponseBody {
  success: true;
  data: {
    user: PublicUserRecord;
    accessToken: string;
  };
}

interface AccessTokenResponseBody {
  success: true;
  data: { accessToken: string };
}

interface MessageResponseBody {
  success: true;
  data: { message: string };
}

interface MyAccountResponseBody {
  success: true;
  data: MyAccountRecord & { profile: UserProfileRecord };
}

interface UpdateMyProfileResponseBody {
  success: true;
  data: UpdatedMyProfileRecord;
}

interface AdminUserListResponseBody {
  success: true;
  data: {
    items: AdminUserListResult['items'];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

interface AdminUserDetailResponseBody {
  success: true;
  data: AdminUserDetailRecord;
}

interface UpdatedUserStatusResponseBody {
  success: true;
  data: UpdatedAdminUserStatusRecord;
}

interface UpdatedUserRoleResponseBody {
  success: true;
  data: UpdatedAdminUserRoleRecord;
}

interface ErrorResponseBody {
  success: false;
  error: { code: string; message: string; details?: string[] };
}

interface AdminCategoryListResponseBody {
  success: true;
  data: { items: AdminCategoryRecord[] };
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface AdminCategoryDetailResponseBody {
  success: true;
  data: { category: AdminCategoryRecord; articleCount: number };
}

interface CategoryMutationResponseBody {
  success: true;
  data: { category: PublicCategoryRecord };
}

interface CategoryStatusResponseBody {
  success: true;
  data: { id: string; isActive: boolean };
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

const refreshTokenFromCookie = (cookie: string): string =>
  cookie.split(';', 1)[0].replace('refreshToken=', '');

const refreshTokenHash = (tokenId: string): string =>
  createHash('sha256').update(tokenId).digest('hex');

class InMemoryUsersRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly profiles = new Map<string, UserProfileRecord>();
  private readonly accountDates = new Map<
    string,
    { createdAt: Date; lastLoginAt: Date | null; updatedAt: Date }
  >();
  private readonly refreshSessions = new Map<
    string,
    { userId: string; expiresAt: Date; revokedAt: Date | null }
  >();

  reset(): void {
    this.users.clear();
    this.profiles.clear();
    this.accountDates.clear();
    this.refreshSessions.clear();
  }

  findByEmailWithPassword(email: string): Promise<AuthUserRecord | null> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email === email,
    );
    return Promise.resolve(user ? { ...user } : null);
  }

  findByIdWithPassword(id: string): Promise<AuthUserRecord | null> {
    const user = this.users.get(id);
    return Promise.resolve(user ? { ...user } : null);
  }

  findSafeById(id: string): Promise<PublicUserRecord | null> {
    const user = this.users.get(id);
    return Promise.resolve(user ? this.toSafeUser(user) : null);
  }

  findMyAccount(id: string): Promise<MyAccountRecord | null> {
    const user = this.users.get(id);

    if (!user) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      ...this.toSafeUser(user),
      profile: this.profiles.get(id) ?? null,
    });
  }

  updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput,
  ): Promise<UpdatedMyProfileRecord> {
    const user = this.users.get(userId);
    const profile = this.profiles.get(userId);

    if (!user || !profile) {
      return Promise.reject(
        Object.assign(new Error('profile not found'), { code: 'P2025' }),
      );
    }

    const updatedProfile = { ...profile, ...input };
    this.profiles.set(userId, updatedProfile);
    return Promise.resolve({
      user: this.toSafeUser(user),
      profile: updatedProfile,
    });
  }

  findAdminUsers(query: AdminUserListQuery): Promise<AdminUserListResult> {
    const normalizedSearch = query.q?.toLowerCase();
    const direction = query.sort === 'oldest' ? 1 : -1;
    const filtered = [...this.users.values()]
      .filter((user) => !query.role || user.role === query.role)
      .filter((user) => !query.status || user.status === query.status)
      .filter((user) => {
        if (!normalizedSearch) return true;
        const displayName = this.profiles.get(user.id)?.displayName ?? '';
        return (
          user.email.toLowerCase().includes(normalizedSearch) ||
          displayName.toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((left, right) => {
        const leftCreatedAt = this.requiredAccountDates(left.id).createdAt;
        const rightCreatedAt = this.requiredAccountDates(right.id).createdAt;
        const createdComparison =
          (leftCreatedAt.getTime() - rightCreatedAt.getTime()) * direction;
        return createdComparison || left.id.localeCompare(right.id);
      });
    const start = (query.page - 1) * query.limit;
    const items = filtered.slice(start, start + query.limit).map((user) => {
      const dates = this.requiredAccountDates(user.id);
      const profile = this.profiles.get(user.id);
      return {
        ...this.toSafeUser(user),
        createdAt: dates.createdAt,
        lastLoginAt: dates.lastLoginAt,
        profile: profile ? { displayName: profile.displayName } : null,
      };
    });

    return Promise.resolve({ items, total: filtered.length });
  }

  findAdminUserDetail(userId: string): Promise<AdminUserDetailRecord | null> {
    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      user: {
        ...this.toSafeUser(user),
        createdAt: this.requiredAccountDates(userId).createdAt,
        lastLoginAt: this.requiredAccountDates(userId).lastLoginAt,
      },
      profile: this.profiles.get(userId) ?? null,
      learningSummary: {
        savedVocabularyCount: 0,
        masteredVocabularyCount: 0,
        completedArticleCount: 0,
      },
    });
  }

  updateAdminUserStatus(
    userId: string,
    status: AuthUserRecord['status'],
  ): Promise<AdminUserMutationResult<UpdatedAdminUserStatusRecord>> {
    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve({ outcome: 'not_found' });
    }

    const dates = this.requiredAccountDates(userId);

    if (user.status === status) {
      return Promise.resolve({
        outcome: 'success',
        user: { id: user.id, status: user.status, updatedAt: dates.updatedAt },
      });
    }

    if (
      user.role === 'ADMIN' &&
      user.status === 'ACTIVE' &&
      status !== 'ACTIVE' &&
      this.activeAdminCount() <= 1
    ) {
      return Promise.resolve({ outcome: 'last_active_admin' });
    }

    user.status = status;
    dates.updatedAt = new Date();
    if (status !== 'ACTIVE') {
      this.revokeAllRefreshSessions(userId);
    }
    return Promise.resolve({
      outcome: 'success',
      user: { id: user.id, status: user.status, updatedAt: dates.updatedAt },
    });
  }

  updateAdminUserRole(
    userId: string,
    role: AuthUserRecord['role'],
  ): Promise<AdminUserMutationResult<UpdatedAdminUserRoleRecord>> {
    const user = this.users.get(userId);

    if (!user) {
      return Promise.resolve({ outcome: 'not_found' });
    }

    const dates = this.requiredAccountDates(userId);

    if (user.role === role) {
      return Promise.resolve({
        outcome: 'success',
        user: { id: user.id, role: user.role, updatedAt: dates.updatedAt },
      });
    }

    if (
      user.role === 'ADMIN' &&
      user.status === 'ACTIVE' &&
      role !== 'ADMIN' &&
      this.activeAdminCount() <= 1
    ) {
      return Promise.resolve({ outcome: 'last_active_admin' });
    }

    user.role = role;
    dates.updatedAt = new Date();
    return Promise.resolve({
      outcome: 'success',
      user: { id: user.id, role: user.role, updatedAt: dates.updatedAt },
    });
  }

  createWithProfile(
    input: CreateRegisteredUserInput,
  ): Promise<PublicUserRecord> {
    const duplicate = [...this.users.values()].some(
      (user) => user.email === input.email,
    );

    if (duplicate) {
      return Promise.reject(
        Object.assign(new Error('duplicate email'), { code: 'P2002' }),
      );
    }

    const user: AuthUserRecord = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: 'USER',
      status: 'ACTIVE',
    };
    this.users.set(user.id, user);
    const createdAt = new Date(
      Date.UTC(2026, 6, 22, 10, 0, this.users.size - 1),
    );
    this.accountDates.set(user.id, {
      createdAt,
      lastLoginAt: null,
      updatedAt: createdAt,
    });
    this.profiles.set(user.id, {
      displayName: input.displayName,
      avatarUrl: null,
      currentCefrLevel: 'A1',
      learningGoal: null,
      dailyStudyMinutes: null,
      preferredLanguage: input.preferredLanguage ?? 'vi',
    });
    return Promise.resolve(this.toSafeUser(user));
  }

  updateLastLogin(id: string): Promise<PublicUserRecord> {
    this.requiredAccountDates(id).lastLoginAt = new Date();
    return Promise.resolve(this.requiredSafeUser(id));
  }

  updatePassword(id: string, passwordHash: string): Promise<PublicUserRecord> {
    const user = this.users.get(id);

    if (!user) {
      throw new Error('user not found');
    }

    user.passwordHash = passwordHash;
    this.revokeAllRefreshSessions(id);
    return Promise.resolve(this.toSafeUser(user));
  }

  createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.refreshSessions.set(input.tokenHash, {
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  isRefreshSessionActive(userId: string, tokenHash: string): Promise<boolean> {
    const session = this.refreshSessions.get(tokenHash);
    return Promise.resolve(
      session?.userId === userId &&
        session.revokedAt === null &&
        session.expiresAt > new Date(),
    );
  }

  async rotateRefreshSession(
    userId: string,
    previousTokenHash: string,
    nextSession: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<boolean> {
    if (!(await this.isRefreshSessionActive(userId, previousTokenHash))) {
      return false;
    }

    const previous = this.refreshSessions.get(previousTokenHash);
    if (!previous) return false;

    previous.revokedAt = new Date();
    await this.createRefreshSession(nextSession);
    return true;
  }

  revokeRefreshSession(userId: string, tokenHash: string): Promise<void> {
    const session = this.refreshSessions.get(tokenHash);
    if (session?.userId === userId && session.revokedAt === null) {
      session.revokedAt = new Date();
    }
    return Promise.resolve();
  }

  expireRefreshSession(tokenHash: string): void {
    const session = this.refreshSessions.get(tokenHash);
    if (session) session.expiresAt = new Date(0);
  }

  setStatusByEmail(email: string, status: AuthUserRecord['status']): void {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email === email,
    );

    if (user) {
      user.status = status;
      if (status !== 'ACTIVE') {
        this.revokeAllRefreshSessions(user.id);
      }
    }
  }

  setRoleByEmail(email: string, role: AuthUserRecord['role']): void {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email === email,
    );

    if (user) {
      user.role = role;
    }
  }

  private requiredSafeUser(id: string): PublicUserRecord {
    const user = this.users.get(id);

    if (!user) {
      throw new Error('user not found');
    }

    return this.toSafeUser(user);
  }

  private requiredAccountDates(id: string): {
    createdAt: Date;
    lastLoginAt: Date | null;
    updatedAt: Date;
  } {
    const dates = this.accountDates.get(id);

    if (!dates) {
      throw new Error('account dates not found');
    }

    return dates;
  }

  private activeAdminCount(): number {
    return [...this.users.values()].filter(
      (user) => user.role === 'ADMIN' && user.status === 'ACTIVE',
    ).length;
  }

  private revokeAllRefreshSessions(userId: string): void {
    for (const session of this.refreshSessions.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = new Date();
      }
    }
  }

  private toSafeUser(user: AuthUserRecord): PublicUserRecord {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }
}

describe('Auth and Users APIs (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryUsersRepository;
  let categoriesRepository: InMemoryCategoriesRepository;
  let articlesRepository: InMemoryArticlesRepository;

  beforeAll(async () => {
    repository = new InMemoryUsersRepository();
    categoriesRepository = new InMemoryCategoriesRepository();
    articlesRepository = new InMemoryArticlesRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(authConfig)
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .overrideProvider(CategoriesRepository)
      .useValue(categoriesRepository)
      .overrideProvider(ArticlesRepository)
      .useValue(articlesRepository)
      .overrideGuard(AuthenticatedUserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => {
    repository.reset();
    categoriesRepository.reset();
    articlesRepository.reset();
  });

  afterAll(async () => app.close());

  const registerWithRole = async (
    input: typeof registration,
    role: 'ADMIN' | 'USER',
  ): Promise<AuthResponseBody> => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    repository.setRoleByEmail(input.email, role);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    return responseBody<AuthResponseBody>(login);
  };

  const prepareParsedArticle = async (
    authorization: string,
    contentHtml: string,
  ): Promise<{
    articleId: string;
    contentHtml: string;
    sentences: Array<{
      id: string;
      sentenceOrder: number;
      sentenceText: string;
    }>;
  }> => {
    const articleId = '44444444-4444-4444-8444-444444444444';
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .send({ contentHtml })
      .expect(200);
    const parsed = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/sentences?page=1&limit=100`)
      .set('Authorization', authorization)
      .expect(200);
    return {
      articleId,
      contentHtml: responseBody<{ data: { contentHtml: string } }>(parsed).data
        .contentHtml,
      sentences: responseBody<{
        data: {
          items: Array<{
            id: string;
            sentenceOrder: number;
            sentenceText: string;
          }>;
        };
      }>(listed).data.items,
    };
  };

  const termPayload = (value: string, unitType: 'WORD' | 'PHRASE') => ({
    value,
    wordDisplay: value,
    lemma: value,
    normalizedLemma: value,
    unitType,
    partOfSpeech: unitType === 'WORD' ? 'noun' : 'noun phrase',
    cefrLevel: 'B1',
    contextualMeaningVi: 'Nghĩa theo ngữ cảnh',
    definitionEn: `Definition for ${value}`,
    contextualExplanation: `Explanation for ${value}`,
    examples: [
      {
        sentence: `${value} appears in context.`,
        translationVi: `${value} xuất hiện trong ngữ cảnh.`,
      },
    ],
  });

  const preparePublishableArticle = async (
    authorization: string,
  ): Promise<{
    articleId: string;
    sentenceId: string;
    termId: string;
  }> => {
    const prepared = await prepareParsedArticle(
      authorization,
      '<p>Digital tools improve learning.</p>',
    );
    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${prepared.sentences[0].id}`,
      )
      .set('Authorization', authorization)
      .send({ translationVi: 'Công cụ kỹ thuật số cải thiện việc học.' })
      .expect(200);
    const created = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${prepared.sentences[0].id}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('tools', 'WORD'))
      .expect(201);
    return {
      articleId: prepared.articleId,
      sentenceId: prepared.sentences[0].id,
      termId: responseBody<{ data: { term: { id: string } } }>(created).data
        .term.id,
    };
  };

  it('handles CORS preflight and includes Access-Control-Allow-Origin for allowed origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/auth/refresh')
      .set('Origin', 'https://vocab-mate.onrender.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://vocab-mate.onrender.com',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('publishes Swagger operations for exactly the five documented Auth APIs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swaggerBody = responseBody<{
      paths: Record<
        string,
        Record<string, { operationId: string; responses: object }>
      >;
    }>(response);
    const paths = swaggerBody.paths;

    expect(paths['/api/v1/auth/register'].post.operationId).toBe(
      'postAuthRegister',
    );
    expect(paths['/api/v1/auth/login'].post.operationId).toBe('postAuthLogin');
    expect(paths['/api/v1/auth/refresh'].post.operationId).toBe(
      'postAuthRefresh',
    );
    expect(paths['/api/v1/auth/logout'].post.operationId).toBe(
      'postAuthLogout',
    );
    expect(paths['/api/v1/auth/change-password'].patch.operationId).toBe(
      'patchAuthChangePassword',
    );
    expect(paths['/api/v1/auth/me']).toBeUndefined();
  });

  it('publishes the documented Users self-service Swagger operations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swaggerBody = responseBody<{
      paths: Record<
        string,
        Record<string, { operationId: string; responses: object }>
      >;
    }>(response);
    const usersMe = swaggerBody.paths['/api/v1/users/me'];

    expect(usersMe.get.operationId).toBe('getUsersMe');
    expect(usersMe.patch.operationId).toBe('patchUsersMe');
  });

  it('publishes the documented admin Users operations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swaggerBody = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters: Array<{ name: string }>;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
    }>(response);
    const listOperation = swaggerBody.paths['/api/v1/admin/users'].get;
    const detailOperation =
      swaggerBody.paths['/api/v1/admin/users/{userId}'].get;
    const statusOperation =
      swaggerBody.paths['/api/v1/admin/users/{userId}/status'].patch;
    const roleOperation =
      swaggerBody.paths['/api/v1/admin/users/{userId}/role'].patch;

    expect(listOperation.operationId).toBe('getAdminUsers');
    expect(listOperation.parameters.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['page', 'limit', 'q', 'role', 'status', 'sort']),
    );
    expect(Object.keys(listOperation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '500']),
    );
    expect(listOperation.security).toContainEqual({ BearerAuth: [] });
    expect(detailOperation.operationId).toBe('getAdminUsersByUserId');
    expect(detailOperation.parameters.map(({ name }) => name)).toContain(
      'userId',
    );
    expect(Object.keys(detailOperation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(statusOperation.operationId).toBe('patchAdminUsersByUserIdStatus');
    expect(roleOperation.operationId).toBe('patchAdminUsersByUserIdRole');
    for (const operation of [statusOperation, roleOperation]) {
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining([
          '200',
          '400',
          '401',
          '403',
          '404',
          '409',
          '500',
        ]),
      );
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
  });

  it('publishes CAT-003 through CAT-008 with ADMIN security and corrected schemas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters?: Array<{ name: string }>;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
    }>(response);
    const list = swagger.paths['/api/v1/admin/categories'].get;
    const create = swagger.paths['/api/v1/admin/categories'].post;
    const detail = swagger.paths['/api/v1/admin/categories/{categoryId}'].get;
    const update = swagger.paths['/api/v1/admin/categories/{categoryId}'].patch;
    const updateStatus =
      swagger.paths['/api/v1/admin/categories/{categoryId}/status'].patch;
    const deleteCategory =
      swagger.paths['/api/v1/admin/categories/{categoryId}'].delete;

    expect(list.operationId).toBe('getAdminCategories');
    expect(list.parameters?.map(({ name }) => name)).toEqual([
      'page',
      'limit',
      'q',
      'isActive',
    ]);
    expect(detail.operationId).toBe('getAdminCategoriesByCategoryId');
    expect(create.operationId).toBe('postAdminCategories');
    expect(update.operationId).toBe('patchAdminCategoriesByCategoryId');
    expect(updateStatus.operationId).toBe(
      'patchAdminCategoriesByCategoryIdStatus',
    );
    expect(deleteCategory.operationId).toBe(
      'deleteAdminCategoriesByCategoryId',
    );
    expect(Object.keys(create.responses)).toContain('201');
    expect(Object.keys(detail.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(Object.keys(update.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409', '500']),
    );
    expect(Object.keys(updateStatus.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(Object.keys(updateStatus.responses)).not.toContain('409');
    expect(Object.keys(deleteCategory.responses)).toEqual(
      expect.arrayContaining(['204', '400', '401', '403', '404', '409', '500']),
    );
    expect(deleteCategory.responses['204']).not.toHaveProperty('content');
    for (const operation of [
      list,
      detail,
      create,
      update,
      updateStatus,
      deleteCategory,
    ]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
  });

  it('CAT-003 through CAT-006 require authentication and ADMIN authorization', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/categories?page=1&limit=20')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/categories/22222222-2222-4222-8222-222222222222')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .send({ name: 'New', slug: 'new' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/categories/22222222-2222-4222-8222-222222222222')
      .send({ name: 'Updated' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(
        '/api/v1/admin/categories/22222222-2222-4222-8222-222222222222/status',
      )
      .send({ isActive: false })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/categories/11111111-1111-4111-8111-111111111111')
      .expect(401);

    const normalUser = await registerWithRole(registration, 'USER');
    await request(app.getHttpServer())
      .get('/api/v1/admin/categories?page=1&limit=20')
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .send({ name: 'New', slug: 'new' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(
        '/api/v1/admin/categories/22222222-2222-4222-8222-222222222222/status',
      )
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .send({ isActive: false })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/categories/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .expect(403);
  });

  it('CAT-003 returns active and inactive categories with root pagination metadata', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/categories?page=1&limit=3')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    const body = responseBody<AdminCategoryListResponseBody>(response);

    expect(body.meta).toEqual({
      page: 1,
      limit: 3,
      total: 5,
      totalPages: 2,
    });
    expect(body.data.items).toHaveLength(3);
    expect(body.data.items.some(({ isActive }) => !isActive)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('createdByUserId');
    expect(JSON.stringify(body)).not.toContain('articles');
  });

  it('CAT-003 applies normalized q and boolean filters', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/categories?page=1&limit=20&q=%20technology%20&isActive=false',
      )
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    const body = responseBody<AdminCategoryListResponseBody>(response);

    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      slug: 'hidden-technology',
      isActive: false,
    });
  });

  it('CAT-004 returns category plus articleCount without article records', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/categories/22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    const body = responseBody<AdminCategoryDetailResponseBody>(response);

    expect(body.data.category.slug).toBe('technology');
    expect(body.data.articleCount).toBe(3);
    expect(body.data).not.toHaveProperty('article');
    expect(JSON.stringify(body)).not.toContain('createdByUserId');
  });

  it('CAT-005 creates with normalized fields and documented defaults', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ name: '  Business  ', slug: '  BUSINESS  ' })
      .expect(201);
    const createdBody = responseBody<CategoryMutationResponseBody>(created);
    expect(createdBody.data.category).toMatchObject({
      name: 'Business',
      slug: 'business',
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/categories/${createdBody.data.category.id}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    expect(
      responseBody<AdminCategoryDetailResponseBody>(detail).data.category,
    ).toMatchObject({ isActive: true, displayOrder: 0 });
  });

  it('CAT-005 rejects duplicate slugs, invalid input, and client audit fields', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;

    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', authorization)
      .send({ name: 'Duplicate', slug: 'TECHNOLOGY' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', authorization)
      .send({ name: '', slug: 'invalid_slug' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', authorization)
      .send({
        name: 'Audit Attempt',
        slug: 'audit-attempt',
        createdByUserId: admin.data.user.id,
      })
      .expect(400);
  });

  it('CAT-006 partially updates while preserving omitted fields and status', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const categoryId = '55555555-5555-4555-8555-555555555555';

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .send({ name: '  Hidden Updated  ' })
      .expect(200);
    expect(
      responseBody<CategoryMutationResponseBody>(updated).data.category,
    ).toMatchObject({
      id: categoryId,
      name: 'Hidden Updated',
      slug: 'hidden-technology',
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<AdminCategoryDetailResponseBody>(detail).data.category,
    ).toMatchObject({ isActive: false, description: 'Inactive category' });
  });

  it('CAT-006 rejects empty/status updates and maps missing or duplicate slugs', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const categoryId = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .send({ slug: 'science' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${randomUUID()}`)
      .set('Authorization', authorization)
      .send({ name: 'Missing' })
      .expect(404);
  });

  it('CAT-007 deactivates and reactivates a used category without changing its articles', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const categoryId = '22222222-2222-4222-8222-222222222222';

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/status`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(200);
    expect(responseBody<CategoryStatusResponseBody>(deactivated)).toEqual({
      success: true,
      data: { id: categoryId, isActive: false },
    });

    const publicList = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);
    expect(publicList.text).not.toContain('technology');
    await request(app.getHttpServer())
      .get('/api/v1/categories/technology')
      .expect(404);

    const adminDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<AdminCategoryDetailResponseBody>(adminDetail).data,
    ).toMatchObject({
      category: { id: categoryId, isActive: false },
      articleCount: 3,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/status`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/status`)
      .set('Authorization', authorization)
      .send({ isActive: true })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/categories/technology')
      .expect(200);
  });

  it('CAT-007 validates status input and maps unknown categories to 404', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const categoryId = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}/status`)
      .set('Authorization', authorization)
      .send({ isActive: 'false' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${randomUUID()}/status`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(404);
  });

  it('CAT-008 deletes an unused category with an empty 204 response', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const categoryId = '11111111-1111-4111-8111-111111111111';

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .expect(204);
    expect(deleted.text).toBe('');

    await request(app.getHttpServer())
      .get(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('CAT-008 blocks used categories and returns 404 for unknown categories', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;

    const conflict = await request(app.getHttpServer())
      .delete('/api/v1/admin/categories/22222222-2222-4222-8222-222222222222')
      .set('Authorization', authorization)
      .expect(409);
    expect(responseBody<ErrorResponseBody>(conflict)).toMatchObject({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Category is used by articles; deactivate it instead',
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${randomUUID()}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('publishes ART-003 through ART-007 with ADMIN security and documented responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters?: Array<{ name: string }>;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<
              string,
              { nullable?: boolean; enum?: string[] }
            >;
          }
        >;
      };
    }>(response);
    const collection = swagger.paths['/api/v1/admin/articles'];
    const member = swagger.paths['/api/v1/admin/articles/{articleId}'];

    expect(collection.get.operationId).toBe('getAdminArticles');
    expect(collection.get.parameters?.map(({ name }) => name)).toEqual([
      'page',
      'limit',
      'q',
      'categoryId',
      'cefrLevel',
      'status',
      'sort',
    ]);
    expect(collection.post.operationId).toBe('postAdminArticles');
    expect(Object.keys(collection.post.responses)).toContain('201');
    expect(member.get.operationId).toBe('getAdminArticlesByArticleId');
    expect(member.patch.operationId).toBe('patchAdminArticlesByArticleId');
    expect(member.delete.operationId).toBe('deleteAdminArticlesByArticleId');
    expect(Object.keys(member.delete.responses)).toContain('204');
    const adminArticleProperties =
      swagger.components.schemas['AdminArticleDto'].properties ?? {};
    expect(adminArticleProperties.importSource?.nullable).toBe(true);
    expect(adminArticleProperties.externalId?.nullable).toBe(true);
    expect(adminArticleProperties.canonicalUrl?.nullable).toBe(true);
    expect(adminArticleProperties.contentHash?.nullable).toBe(true);
    expect(adminArticleProperties.sourcePublishedAt?.nullable).toBe(true);
    expect(adminArticleProperties.aiAnalysisStatus?.nullable).toBe(true);
    expect(adminArticleProperties.aiAnalysisError?.nullable).toBe(true);
    for (const operation of [
      collection.get,
      collection.post,
      member.get,
      member.patch,
      member.delete,
    ]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
  });

  it('ART-003 through ART-007 require ADMIN authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/articles?page=1&limit=20')
      .expect(401);

    const normalUser = await registerWithRole(registration, 'USER');
    await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .send({})
      .expect(403);
  });

  it('ART-003 lists all statuses with database-style filters and no HTML', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/articles?page=1&limit=20&q=draft&status=DRAFT&sort=oldest',
      )
      .set('Authorization', authorization)
      .expect(200);
    const body = responseBody<{
      success: true;
      data: { items: Array<Record<string, unknown>>; meta: { total: number } };
    }>(response);

    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      slug: 'draft-article',
      status: 'DRAFT',
    });
    expect(body.data.items[0]).not.toHaveProperty('contentHtml');
    expect(body.data.meta.total).toBe(1);

    await request(app.getHttpServer())
      .get('/api/v1/admin/articles?page=1&limit=101')
      .set('Authorization', authorization)
      .expect(400);
  });

  it('ART-004 returns current content state and efficient aggregate counts', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/articles/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authorization)
      .expect(200);
    const body = responseBody<{
      data: {
        article: Record<string, unknown>;
        sentenceCount: number;
        termCount: number;
        quizCount: number;
      };
    }>(response);

    expect(body.data.article).toMatchObject({
      slug: 'how-technology-changes-learning',
      contentVersion: 1,
      contentHtml: '<p>Private reader payload.</p>',
    });
    expect(body.data).toMatchObject({
      sentenceCount: 0,
      termCount: 0,
      quizCount: 4,
    });
    expect(body.data.article).not.toHaveProperty('createdBy');

    await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${randomUUID()}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('ART-005 creates a sanitized version-one DRAFT and handles invalid references', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const payload = {
      categoryId: '22222222-2222-4222-8222-222222222222',
      title: '  Admin Article  ',
      slug: '  ADMIN-ARTICLE  ',
      summary: '  Summary  ',
      contentHtml:
        '<script>bad()</script><p onclick="bad()">Safe reader content</p>',
      cefrLevel: 'B1',
    };
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', authorization)
      .send(payload)
      .expect(201);
    const article = responseBody<{
      data: { article: Record<string, unknown> };
    }>(created).data.article;

    expect(article).toMatchObject({
      title: 'Admin Article',
      slug: 'admin-article',
      status: 'DRAFT',
      contentVersion: 1,
      contentHtml: '<p>Safe reader content</p>',
      importSource: null,
      externalId: null,
      canonicalUrl: null,
      contentHash: null,
      sourcePublishedAt: null,
      aiAnalysisStatus: null,
      aiAnalysisError: null,
      publishedAt: null,
      archivedAt: null,
    });

    await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', authorization)
      .send(payload)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', authorization)
      .send({ ...payload, slug: 'other', categoryId: randomUUID() })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', authorization)
      .send({
        ...payload,
        slug: 'invalid-html',
        contentHtml: '<script>x</script>',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/articles')
      .set('Authorization', authorization)
      .send({
        ...payload,
        slug: 'audit-attempt',
        createdByUserId: randomUUID(),
      })
      .expect(400);
  });

  it('ART-006 distinguishes metadata and content updates and rejects archived mutation', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const draftId = '44444444-4444-4444-8444-444444444444';

    const metadata = await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${draftId}`)
      .set('Authorization', authorization)
      .send({ title: 'Updated Draft' })
      .expect(200);
    expect(
      responseBody<{
        data: { article: { contentVersion: number }; contentChanged: boolean };
      }>(metadata).data,
    ).toMatchObject({
      article: { contentVersion: 1 },
      contentChanged: false,
    });

    const content = await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${draftId}`)
      .set('Authorization', authorization)
      .send({ contentHtml: '<p onmouseover="bad()">New content</p>' })
      .expect(200);
    expect(
      responseBody<{
        data: {
          article: { contentVersion: number; contentHtml: string };
          contentChanged: boolean;
        };
      }>(content).data,
    ).toMatchObject({
      article: { contentVersion: 2, contentHtml: '<p>New content</p>' },
      contentChanged: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${draftId}`)
      .set('Authorization', authorization)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/articles/55555555-5555-4555-8555-555555555555')
      .set('Authorization', authorization)
      .send({ title: 'Blocked' })
      .expect(409);
  });

  it('ART-007 returns empty 204 only for an unused draft', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const unusedDraft = await articlesRepository.create({
      categoryId: '22222222-2222-4222-8222-222222222222',
      title: 'Unused Draft',
      slug: 'unused-draft',
      summary: 'Summary',
      contentHtml: '<p>Content</p>',
      cefrLevel: 'B1',
      createdByUserId: admin.data.user.id,
      updatedByUserId: admin.data.user.id,
    });
    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/admin/articles/${unusedDraft.id}`)
      .set('Authorization', authorization)
      .expect(204);
    expect(deleted.text).toBe('');

    await request(app.getHttpServer())
      .delete('/api/v1/admin/articles/11111111-1111-4111-8111-111111111111')
      .set('Authorization', authorization)
      .expect(409);

    const created = await articlesRepository.create({
      categoryId: '22222222-2222-4222-8222-222222222222',
      title: 'Used Draft',
      slug: 'used-draft',
      summary: 'Summary',
      contentHtml: '<p>Content</p>',
      cefrLevel: 'B1',
      createdByUserId: admin.data.user.id,
      updatedByUserId: admin.data.user.id,
    });
    articlesRepository.setDeleteSafety(created.id, { readingProgressCount: 1 });
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/articles/${created.id}`)
      .set('Authorization', authorization)
      .expect(409);
  });

  it('documents ART-008 through ART-011 as ADMIN operations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
    }>(response);
    const parse =
      swagger.paths['/api/v1/admin/articles/{articleId}/parse-content'].post;
    const sentences =
      swagger.paths['/api/v1/admin/articles/{articleId}/sentences'];
    const sentence =
      swagger.paths[
        '/api/v1/admin/articles/{articleId}/sentences/{sentenceId}'
      ];

    expect(parse.operationId).toBe('postAdminArticleParseContent');
    expect(Object.keys(parse.responses)).toEqual(
      expect.arrayContaining(['200', '409', '422']),
    );
    expect(sentences.get.operationId).toBe('getAdminArticleSentences');
    expect(sentence.get.operationId).toBe('getAdminArticleSentenceById');
    expect(sentence.patch.operationId).toBe('patchAdminArticleSentenceById');
    for (const operation of [
      parse,
      sentences.get,
      sentence.get,
      sentence.patch,
    ]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
  });

  it('ART-008 parses atomically, creates matching current-version rows, and force-replaces markers', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .send({
        contentHtml:
          '<h2>Daily news.</h2><p>Dr. Smith arrived. Students listened.</p>',
      })
      .expect(200);

    const parsed = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    const parsedData = responseBody<{
      data: {
        contentVersion: number;
        sentenceCount: number;
        contentHtml: string;
      };
    }>(parsed).data;
    const firstMarkerIds = [
      ...parsedData.contentHtml.matchAll(/data-sentence-id="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(parsedData).toMatchObject({ contentVersion: 2, sentenceCount: 3 });
    expect(new Set(firstMarkerIds).size).toBe(3);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/sentences?page=1&limit=100`)
      .set('Authorization', authorization)
      .expect(200);
    const listData = responseBody<{
      data: {
        contentVersion: number;
        items: Array<{
          id: string;
          contentVersion: number;
          sentenceOrder: number;
        }>;
        meta: { total: number };
      };
    }>(listed).data;
    expect(listData.contentVersion).toBe(2);
    expect(listData.items.map(({ contentVersion }) => contentVersion)).toEqual([
      2, 2, 2,
    ]);
    expect(listData.items.map(({ sentenceOrder }) => sentenceOrder)).toEqual([
      1, 2, 3,
    ]);
    expect(new Set(listData.items.map(({ id }) => id))).toEqual(
      new Set(firstMarkerIds),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(409);

    const forced = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({ force: true })
      .expect(200);
    const forcedHtml = responseBody<{ data: { contentHtml: string } }>(forced)
      .data.contentHtml;
    expect(forcedHtml).not.toContain(firstMarkerIds[0]);
    expect(forcedHtml.match(/data-sentence-id=/g)).toHaveLength(3);
  });

  it('ART-008 rolls back HTML and rows when persistence fails', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';
    articlesRepository.failNextParse();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(500);

    const article = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { article: { contentHtml: string } } }>(article).data
        .article.contentHtml,
    ).toBe('<p>Draft content.</p>');
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/sentences?page=1&limit=20`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { items: unknown[]; meta: { total: number } } }>(
        list,
      ).data,
    ).toMatchObject({ items: [], meta: { total: 0 } });
  });

  it('ART-009 through ART-011 enforce pagination, current ownership, immutable text, and metadata-only updates', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .send({ contentHtml: '<p>One. Two! Three?</p>' })
      .expect(200);
    const parsed = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    const originalHtml = responseBody<{ data: { contentHtml: string } }>(parsed)
      .data.contentHtml;

    const page = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/sentences?page=2&limit=1`)
      .set('Authorization', authorization)
      .expect(200);
    const pageData = responseBody<{
      data: {
        items: Array<{
          id: string;
          sentenceOrder: number;
          sentenceText: string;
        }>;
        meta: { page: number; total: number; totalPages: number };
      };
    }>(page).data;
    expect(pageData).toMatchObject({
      items: [{ sentenceOrder: 2, sentenceText: 'Two!' }],
      meta: { page: 2, total: 3, totalPages: 3 },
    });
    const sentenceId = pageData.items[0].id;

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/sentences/${sentenceId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { terms: unknown[] } }>(detail).data.terms,
    ).toEqual([]);
    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/11111111-1111-4111-8111-111111111111/sentences/${sentenceId}`,
      )
      .set('Authorization', authorization)
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}/sentences/${sentenceId}`)
      .set('Authorization', authorization)
      .send({ translationVi: '  Bản dịch  ', isActive: false })
      .expect(200);
    expect(
      responseBody<{
        data: { sentence: { translationVi: string; isActive: boolean } };
      }>(updated).data.sentence,
    ).toMatchObject({ translationVi: 'Bản dịch', isActive: false });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}/sentences/${sentenceId}`)
      .set('Authorization', authorization)
      .send({ sentenceText: 'Tampered' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/articles/${articleId}/sentences/${sentenceId}`)
      .set('Authorization', authorization)
      .send({ explanationVi: '   ' })
      .expect(400);

    const inactive = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/${articleId}/sentences?page=1&limit=20&isActive=false`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { items: Array<{ id: string }> } }>(
        inactive,
      ).data.items.map(({ id }) => id),
    ).toEqual([sentenceId]);
    const article = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { article: { contentHtml: string } } }>(article).data
        .article.contentHtml,
    ).toBe(originalHtml);
  });

  it('rejects archived or unparseable articles and protects sentence routes', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    await request(app.getHttpServer())
      .post(
        '/api/v1/admin/articles/55555555-5555-4555-8555-555555555555/parse-content',
      )
      .set('Authorization', authorization)
      .send({})
      .expect(409);

    const imageOnly = await articlesRepository.create({
      categoryId: '22222222-2222-4222-8222-222222222222',
      title: 'Image only',
      slug: 'image-only',
      summary: 'No reader text',
      contentHtml: '<figure><img src="https://example.com/image.png"></figure>',
      cefrLevel: 'A1',
      createdByUserId: admin.data.user.id,
      updatedByUserId: admin.data.user.id,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${imageOnly.id}/parse-content`)
      .set('Authorization', authorization)
      .send({})
      .expect(422);
    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/articles/44444444-4444-4444-8444-444444444444/sentences?page=1&limit=20',
      )
      .expect(401);
  });

  it('documents ART-012 through ART-016 as ADMIN operations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<
              string,
              { nullable?: boolean; enum?: string[] }
            >;
          }
        >;
      };
    }>(response);
    const create =
      swagger.paths[
        '/api/v1/admin/articles/{articleId}/sentences/{sentenceId}/terms'
      ].post;
    const collection =
      swagger.paths['/api/v1/admin/articles/{articleId}/terms'].get;
    const member =
      swagger.paths['/api/v1/admin/articles/{articleId}/terms/{termId}'];

    expect(create.operationId).toBe('postAdminArticleSentenceTerm');
    expect(collection.operationId).toBe('getAdminArticleTerms');
    expect(member.get.operationId).toBe('getAdminArticleTermById');
    expect(member.patch.operationId).toBe('patchAdminArticleTermById');
    expect(member.delete.operationId).toBe('deleteAdminArticleTermById');
    const termProperties =
      swagger.components.schemas['ArticleSentenceTermDto'].properties ?? {};
    expect(termProperties.contextualMeaningVi?.nullable).toBe(true);
    expect(termProperties.origin?.enum).toEqual(['MANUAL', 'AI', 'NLP']);
    expect(termProperties.wordDisplay?.nullable).toBe(true);
    expect(termProperties.normalizedLemma?.nullable).toBe(true);
    expect(termProperties.partOfSpeech?.nullable).toBe(true);
    expect(termProperties.cefrLevel?.nullable).toBe(true);
    expect(termProperties.reviewStatus?.enum).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
    ]);
    expect(termProperties.explanationStatus?.enum).toEqual([
      'PENDING',
      'PROCESSING',
      'READY',
      'FAILED',
    ]);
    for (const operation of [
      create,
      collection,
      member.get,
      member.patch,
      member.delete,
    ]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/articles/44444444-4444-4444-8444-444444444444/terms?page=1&limit=20',
      )
      .expect(401);
  });

  it('ART-012 creates matching markers atomically and rolls back failed writes', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const prepared = await prepareParsedArticle(
      authorization,
      '<p>Digital tools help digital tools reach people.</p>',
    );
    const sentenceId = prepared.sentences[0].id;
    const created = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${sentenceId}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('digital tools', 'PHRASE'))
      .expect(201);
    const createdData = responseBody<{
      data: {
        term: {
          id: string;
          sentenceId: string;
          origin: string;
          reviewStatus: string;
          explanationStatus: string;
        };
        updatedContentHtml: string;
      };
    }>(created).data;
    expect(createdData.term).toMatchObject({
      sentenceId,
      origin: 'MANUAL',
      reviewStatus: 'APPROVED',
      explanationStatus: 'READY',
    });
    expect(
      createdData.updatedContentHtml.match(
        new RegExp(`data-term-id="${createdData.term.id}"`, 'g'),
      ),
    ).toHaveLength(2);

    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${sentenceId}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('absent phrase', 'PHRASE'))
      .expect(422);

    articlesRepository.failNextTermWrite();
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${sentenceId}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('people', 'WORD'))
      .expect(500);
    const article = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${prepared.articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    const persistedHtml = responseBody<{
      data: { article: { contentHtml: string } };
    }>(article).data.article.contentHtml;
    expect(persistedHtml).toBe(createdData.updatedContentHtml);
    expect(persistedHtml).not.toContain('>people</span>');
    const terms = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${prepared.articleId}/terms?page=1&limit=20`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { meta: { total: number } } }>(terms).data.meta
        .total,
    ).toBe(1);
  });

  it('ART-013 through ART-015 filter current terms, enforce ownership, and only rewrite HTML for marker changes', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const prepared = await prepareParsedArticle(
      authorization,
      '<p>Alpha works. Beta helps.</p>',
    );
    const alpha = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${prepared.sentences[0].id}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('Alpha', 'WORD'))
      .expect(201);
    const alphaTerm = responseBody<{
      data: { term: { id: string; sentenceId: string } };
    }>(alpha).data.term;
    const betaPayload = {
      ...termPayload('Beta', 'WORD'),
      cefrLevel: 'B2',
      definitionEn: undefined,
      contextualExplanation: undefined,
      examples: [],
    };
    const beta = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${prepared.articleId}/sentences/${prepared.sentences[1].id}/terms`,
      )
      .set('Authorization', authorization)
      .send(betaPayload)
      .expect(201);
    const betaTerm = responseBody<{ data: { term: { id: string } } }>(beta).data
      .term;

    const page = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${prepared.articleId}/terms?page=2&limit=1`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: {
          items: Array<{
            id: string;
            sentenceOrder: number;
            hasDefinitionEn: boolean;
            hasExamples: boolean;
            contentHtml?: string;
          }>;
          meta: { page: number; total: number; totalPages: number };
        };
      }>(page).data,
    ).toMatchObject({
      items: [
        {
          id: betaTerm.id,
          sentenceOrder: 2,
          hasDefinitionEn: false,
          hasExamples: false,
        },
      ],
      meta: { page: 2, total: 2, totalPages: 2 },
    });
    const filtered = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/${prepared.articleId}/terms?page=1&limit=20&sentenceId=${alphaTerm.sentenceId}&cefrLevel=B1&unitType=WORD&isActive=true&q=alpha`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { items: Array<{ id: string }> } }>(filtered).data
        .items,
    ).toEqual([expect.objectContaining({ id: alphaTerm.id })]);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: { term: { id: string }; sentence: { id: string } };
      }>(detail).data,
    ).toMatchObject({
      term: { id: alphaTerm.id },
      sentence: { id: alphaTerm.sentenceId },
    });
    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/11111111-1111-4111-8111-111111111111/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .expect(404);

    const before = responseBody<{
      data: { article: { contentHtml: string } };
    }>(
      await request(app.getHttpServer())
        .get(`/api/v1/admin/articles/${prepared.articleId}`)
        .set('Authorization', authorization)
        .expect(200),
    ).data.article.contentHtml;
    const metadata = await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .send({ contextualMeaningVi: 'Nghĩa đã cập nhật' })
      .expect(200);
    expect(
      responseBody<{ data: { contentHtmlChanged: boolean } }>(metadata).data
        .contentHtmlChanged,
    ).toBe(false);
    const valueChange = await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .send({
        value: 'works',
        wordDisplay: 'works',
        lemma: 'work',
        normalizedLemma: 'work',
      })
      .expect(200);
    const valueChangeData = responseBody<{
      data: {
        term: { id: string; value: string };
        contentHtmlChanged: boolean;
        contentHtml?: string;
      };
    }>(valueChange).data;
    expect(valueChangeData).toMatchObject({
      term: { id: alphaTerm.id, value: 'works' },
      contentHtmlChanged: true,
    });
    expect(valueChangeData.contentHtml).toBeUndefined();
    const after = responseBody<{
      data: { article: { contentHtml: string } };
    }>(
      await request(app.getHttpServer())
        .get(`/api/v1/admin/articles/${prepared.articleId}`)
        .set('Authorization', authorization)
        .expect(200),
    ).data.article.contentHtml;
    expect(after).not.toBe(before);
    expect(after).toContain(`data-term-id="${alphaTerm.id}">works</span>`);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .send({ value: 'missing' })
      .expect(422);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .send({ synonyms: [' '] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${alphaTerm.id}`,
      )
      .set('Authorization', authorization)
      .send({ sentenceId: randomUUID() })
      .expect(400);
  });

  it('ART-016 unwraps unused markers and preserves referenced terms', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const prepared = await prepareParsedArticle(
      authorization,
      '<p>Alpha works. Beta helps.</p>',
    );
    const createdTerms: Array<{ id: string }> = [];
    for (const [index, value] of ['Alpha', 'Beta'].entries()) {
      const created = await request(app.getHttpServer())
        .post(
          `/api/v1/admin/articles/${prepared.articleId}/sentences/${prepared.sentences[index].id}/terms`,
        )
        .set('Authorization', authorization)
        .send(termPayload(value, 'WORD'))
        .expect(201);
      createdTerms.push(
        responseBody<{ data: { term: { id: string } } }>(created).data.term,
      );
    }

    articlesRepository.setTermReferenced(createdTerms[1].id);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${createdTerms[1].id}`,
      )
      .set('Authorization', authorization)
      .expect(409);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${createdTerms[0].id}`,
      )
      .set('Authorization', authorization)
      .expect(204);

    const article = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${prepared.articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    const contentHtml = responseBody<{
      data: { article: { contentHtml: string } };
    }>(article).data.article.contentHtml;
    expect(contentHtml).toContain('Alpha works.');
    expect(contentHtml).not.toContain(createdTerms[0].id);
    expect(contentHtml).toContain(createdTerms[1].id);
    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${createdTerms[0].id}`,
      )
      .set('Authorization', authorization)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/articles/${prepared.articleId}/terms/${createdTerms[1].id}`,
      )
      .set('Authorization', authorization)
      .expect(200);
  });

  it('documents ART-017 through ART-020 as ADMIN operations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            parameters?: Array<{ name: string }>;
            responses: Record<string, object>;
            security: Array<Record<string, string[]>>;
          }
        >
      >;
      components: {
        schemas: Record<string, { properties?: Record<string, unknown> }>;
      };
    }>(response);
    const publish =
      swagger.paths['/api/v1/admin/articles/{articleId}/publish'].post;
    const archive =
      swagger.paths['/api/v1/admin/articles/{articleId}/archive'].post;
    const restore =
      swagger.paths['/api/v1/admin/articles/{articleId}/restore-draft'].post;
    const preview =
      swagger.paths['/api/v1/admin/articles/{articleId}/preview'].get;

    expect(publish.operationId).toBe('postAdminArticlePublish');
    expect(Object.keys(publish.responses)).toEqual(
      expect.arrayContaining(['200', '404', '409', '422']),
    );
    expect(archive.operationId).toBe('postAdminArticleArchive');
    expect(restore.operationId).toBe('postAdminArticleRestoreDraft');
    expect(preview.operationId).toBe('getAdminArticlePreview');
    expect(preview.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['articleId', 'cefrLevel']),
    );
    expect(
      swagger.components.schemas.ArticlePreviewDataDto.properties,
    ).toHaveProperty('terms');
    expect(
      swagger.components.schemas.ArticlePreviewDataDto.properties,
    ).toHaveProperty('validationWarnings');
    for (const operation of [publish, archive, restore, preview]) {
      expect(operation.security).toContainEqual({ BearerAuth: [] });
    }
    await request(app.getHttpServer())
      .post(
        '/api/v1/admin/articles/44444444-4444-4444-8444-444444444444/publish',
      )
      .expect(401);
    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/articles/44444444-4444-4444-8444-444444444444/preview',
      )
      .expect(401);
  });

  it('ART-017 publishes a valid draft and returns structured failures for an unparsed draft', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';

    const invalid = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/publish`)
      .set('Authorization', authorization)
      .expect(422);
    expect(
      responseBody<{
        error: { issues: Array<{ code: string }> };
      }>(invalid).error.issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_PARSE' }),
        expect.objectContaining({ code: 'MINIMUM_TERMS_NOT_MET' }),
      ]),
    );

    await preparePublishableArticle(authorization);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/publish`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: { id: string; status: string; publishedAt: string };
      }>(published).data,
    ).toMatchObject({ id: articleId, status: 'PUBLISHED' });
    expect(
      Number.isNaN(
        Date.parse(
          responseBody<{ data: { publishedAt: string } }>(published).data
            .publishedAt,
        ),
      ),
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/api/v1/articles/draft-article')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/publish`)
      .set('Authorization', authorization)
      .expect(409);
  });

  it('ART-018 and ART-019 archive without deleting history and restore clean draft timestamps', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const { articleId, termId } =
      await preparePublishableArticle(authorization);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/publish`)
      .set('Authorization', authorization)
      .expect(200);
    const publishedDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    const originalPublishedAt = responseBody<{
      data: { article: { publishedAt: string } };
    }>(publishedDetail).data.article.publishedAt;
    articlesRepository.setDeleteSafety(articleId, {
      readingProgressCount: 2,
      savedVocabularyCount: 1,
      quizCount: 3,
    });
    articlesRepository.setTermReferenced(termId);

    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/archive`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: { id: string; status: string; archivedAt: string };
      }>(archived).data,
    ).toMatchObject({ id: articleId, status: 'ARCHIVED' });
    await request(app.getHttpServer())
      .get('/api/v1/articles/draft-article')
      .expect(404);
    const safety = await articlesRepository.findDeleteSafety(articleId);
    expect(safety).toMatchObject({
      readingProgressCount: 2,
      savedVocabularyCount: 1,
      quizCount: 3,
    });
    const archivedDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: {
          article: {
            status: string;
            publishedAt: string;
            archivedAt: string;
          };
          sentenceCount: number;
          termCount: number;
        };
      }>(archivedDetail).data,
    ).toMatchObject({
      article: {
        status: 'ARCHIVED',
        publishedAt: originalPublishedAt,
      },
      sentenceCount: 1,
      termCount: 1,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/archive`)
      .set('Authorization', authorization)
      .expect(409);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/restore-draft`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { id: string; status: string } }>(restored).data,
    ).toEqual({ id: articleId, status: 'DRAFT' });
    const restoredDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: {
          article: {
            status: string;
            publishedAt: string | null;
            archivedAt: string | null;
          };
          sentenceCount: number;
          termCount: number;
        };
      }>(restoredDetail).data,
    ).toMatchObject({
      article: {
        status: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
      },
      sentenceCount: 1,
      termCount: 1,
    });
  });

  it('ART-020 previews draft CEFR highlights, shared warnings, and current-version-only terms', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';

    const warningPreview = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/preview`)
      .set('Authorization', authorization)
      .expect(200);
    const warningPreviewData = responseBody<{
      data: {
        terms: unknown[];
        validationWarnings: Array<{ code: string }>;
      };
    }>(warningPreview).data;
    expect(warningPreviewData.terms).toEqual([]);
    expect(
      warningPreviewData.validationWarnings.map(({ code }) => code),
    ).toContain('MISSING_PARSE');

    const prepared = await prepareParsedArticle(
      authorization,
      '<p>Alpha helps. Beta works.</p>',
    );
    for (const sentence of prepared.sentences) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/articles/${articleId}/sentences/${sentence.id}`)
        .set('Authorization', authorization)
        .send({ translationVi: `Bản dịch cho câu ${sentence.sentenceOrder}.` })
        .expect(200);
    }
    const alpha = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${articleId}/sentences/${prepared.sentences[0].id}/terms`,
      )
      .set('Authorization', authorization)
      .send({ ...termPayload('Alpha', 'WORD'), cefrLevel: 'A2' })
      .expect(201);
    const alphaId = responseBody<{ data: { term: { id: string } } }>(alpha).data
      .term.id;
    const beta = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${articleId}/sentences/${prepared.sentences[1].id}/terms`,
      )
      .set('Authorization', authorization)
      .send({ ...termPayload('Beta', 'WORD'), cefrLevel: 'C1' })
      .expect(201);
    const betaId = responseBody<{ data: { term: { id: string } } }>(beta).data
      .term.id;

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/preview?cefrLevel=B2`)
      .set('Authorization', authorization)
      .expect(200);
    const previewData = responseBody<{
      data: {
        article: { id: string; contentHtml?: string };
        contentHtml: string;
        terms: Array<{ id: string; isHighlighted: boolean }>;
        validationWarnings: unknown[];
      };
    }>(preview).data;
    expect(previewData.article).not.toHaveProperty('contentHtml');
    expect(previewData.contentHtml).toContain('data-sentence-id');
    expect(previewData.terms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: alphaId, isHighlighted: false }),
        expect.objectContaining({ id: betaId, isHighlighted: true }),
      ]),
    );
    expect(previewData.validationWarnings).toEqual([]);

    const next = await prepareParsedArticle(
      authorization,
      '<p>Gamma changes.</p>',
    );
    const gamma = await request(app.getHttpServer())
      .post(
        `/api/v1/admin/articles/${articleId}/sentences/${next.sentences[0].id}/terms`,
      )
      .set('Authorization', authorization)
      .send(termPayload('Gamma', 'WORD'))
      .expect(201);
    const gammaId = responseBody<{ data: { term: { id: string } } }>(gamma).data
      .term.id;
    const currentPreview = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}/preview`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{
        data: { terms: Array<{ id: string }> };
      }>(currentPreview).data.terms.map(({ id }) => id),
    ).toEqual([gammaId]);
  });

  it('guards lifecycle transitions against concurrent state changes', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const authorization = `Bearer ${admin.data.accessToken}`;
    const articleId = '44444444-4444-4444-8444-444444444444';
    articlesRepository.failNextStatusTransition();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/articles/${articleId}/archive`)
      .set('Authorization', authorization)
      .expect(409);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/articles/${articleId}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      responseBody<{ data: { article: { status: string } } }>(detail).data
        .article.status,
    ).toBe('DRAFT');
  });

  it('USR-003 and USR-004 require authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=20')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${randomUUID()}`)
      .expect(401);
  });

  it('USR-003 and USR-004 reject a normal USER with 403', async () => {
    const normalUser = await registerWithRole(registration, 'USER');

    await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=20')
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${normalUser.data.user.id}`)
      .set('Authorization', `Bearer ${normalUser.data.accessToken}`)
      .expect(403);
  });

  it('USR-003 lists users with correct pagination and no sensitive fields', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    await registerWithRole(registration, 'USER');
    await registerWithRole(
      { ...registration, email: 'second@example.com', displayName: 'Second' },
      'USER',
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=2&sort=oldest')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    const body = responseBody<AdminUserListResponseBody>(response);

    expect(body.data.items).toHaveLength(2);
    expect(body.data.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('USR-003 applies role/status filters and email/display-name search', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    await registerWithRole(registration, 'USER');
    await registerWithRole(
      {
        ...registration,
        email: 'learner@example.com',
        displayName: 'Special Learner',
      },
      'USER',
    );
    repository.setStatusByEmail('learner@example.com', 'SUSPENDED');

    const roleFilter = await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=20&role=ADMIN')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    expect(
      responseBody<AdminUserListResponseBody>(roleFilter).data.meta.total,
    ).toBe(1);

    const statusAndEmail = await request(app.getHttpServer())
      .get(
        '/api/v1/admin/users?page=1&limit=20&status=SUSPENDED&q=learner%40example.com',
      )
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    expect(
      responseBody<AdminUserListResponseBody>(statusAndEmail).data.items[0]
        .email,
    ).toBe('learner@example.com');

    const displayName = await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=20&q=%20Special%20')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    expect(
      responseBody<AdminUserListResponseBody>(displayName).data.meta.total,
    ).toBe(1);
  });

  it.each([
    'limit=20',
    'page=1',
    'page=0&limit=20',
    'page=1&limit=101',
    'page=1&limit=20&role=OWNER',
    'page=1&limit=20&status=DELETED',
    'page=1&limit=20&sort=email',
  ])('USR-003 rejects invalid query %s', async (query) => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );

    await request(app.getHttpServer())
      .get(`/api/v1/admin/users?${query}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(400);
  });

  it('USR-004 returns safe detail and zero-value lightweight counts', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const target = await registerWithRole(registration, 'USER');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${target.data.user.id}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(200);
    const body = responseBody<AdminUserDetailResponseBody>(response);

    expect(body.data.user).toMatchObject({
      id: target.data.user.id,
      email: registration.email,
      role: 'USER',
      status: 'ACTIVE',
    });
    expect(body.data.learningSummary).toEqual({
      savedVocabularyCount: 0,
      masteredVocabularyCount: 0,
      completedArticleCount: 0,
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('USR-004 rejects an invalid UUID and returns 404 for a missing user', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/users/not-a-uuid')
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${randomUUID()}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .expect(404);
  });

  it('USR-005 and USR-006 require authentication and reject a normal USER', async () => {
    const user = await registerWithRole(registration, 'USER');
    const targetId = randomUUID();

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .send({ status: 'SUSPENDED' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .send({ role: 'ADMIN' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .set('Authorization', `Bearer ${user.data.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${user.data.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('USR-005 changes status, remains idempotent, and Auth rejects the inactive account', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const target = await registerWithRole(registration, 'USER');

    const suspended = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/status`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    const suspendedBody =
      responseBody<UpdatedUserStatusResponseBody>(suspended);
    expect(suspendedBody.data).toMatchObject({
      id: target.data.user.id,
      status: 'SUSPENDED',
    });
    expect(suspendedBody.data.updatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(suspendedBody)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/status`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${target.data.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/status`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/status`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ status: 'DISABLED' })
      .expect(200);
  });

  it('USR-006 promotes and demotes another user with a safe response', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );
    const target = await registerWithRole(registration, 'USER');

    const promoted = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/role`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    const promotedBody = responseBody<UpdatedUserRoleResponseBody>(promoted);
    expect(promotedBody.data).toMatchObject({
      id: target.data.user.id,
      role: 'ADMIN',
    });
    expect(promotedBody.data.updatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(promotedBody)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .get('/api/v1/admin/users?page=1&limit=20')
      .set('Authorization', `Bearer ${target.data.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${target.data.user.id}/role`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ role: 'USER' })
      .expect(200);
  });

  it.each([
    ['status', { status: 'DELETED' }],
    ['status', {}],
    ['role', { role: 'OWNER' }],
  ])('USR-005/006 reject invalid %s requests', async (route, body) => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/not-a-uuid/${route}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send(body)
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${randomUUID()}/${route}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send(body)
      .expect(400);
  });

  it.each([
    ['status', { status: 'ACTIVE' }],
    ['role', { role: 'ADMIN' }],
  ])('USR-005/006 return 404 for a missing %s target', async (route, body) => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${randomUUID()}/${route}`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send(body)
      .expect(404);
  });

  it.each(['SUSPENDED', 'DISABLED'] as const)(
    'USR-005 rejects self-%s with 409',
    async (status) => {
      const admin = await registerWithRole(
        { ...registration, email: 'admin@example.com', displayName: 'Admin' },
        'ADMIN',
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${admin.data.user.id}/status`)
        .set('Authorization', `Bearer ${admin.data.accessToken}`)
        .send({ status })
        .expect(409);
      expect(responseBody<ErrorResponseBody>(response).error.code).toBe(
        'CONFLICT',
      );
    },
  );

  it('USR-006 rejects self-demotion and preserves the last active admin', async () => {
    const admin = await registerWithRole(
      { ...registration, email: 'admin@example.com', displayName: 'Admin' },
      'ADMIN',
    );

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${admin.data.user.id}/role`)
      .set('Authorization', `Bearer ${admin.data.accessToken}`)
      .send({ role: 'USER' })
      .expect(409);
    expect(responseBody<ErrorResponseBody>(response).error.code).toBe(
      'CONFLICT',
    );
  });

  it('USR-001 returns the authenticated account and profile without sensitive fields', async () => {
    const authenticated = await registerWithRole(registration, 'USER');
    const accessToken = authenticated.data.accessToken;
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = responseBody<MyAccountResponseBody>(response);

    expect(body.data).toMatchObject({
      email: registration.email,
      role: 'USER',
      status: 'ACTIVE',
      profile: {
        displayName: registration.displayName,
        avatarUrl: null,
        currentCefrLevel: 'A1',
        learningGoal: null,
        dailyStudyMinutes: null,
        preferredLanguage: 'vi',
      },
    });
    expect(body.data).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('USR-001 and USR-002 require authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send({ displayName: 'Updated Name' })
      .expect(401);
  });

  it('USR-002 partially updates only the authenticated profile and persists it', async () => {
    const authenticated = await registerWithRole(registration, 'USER');
    const accessToken = authenticated.data.accessToken;
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: '  Updated Name  ', currentCefrLevel: 'B2' })
      .expect(200);
    const updatedBody = responseBody<UpdateMyProfileResponseBody>(updated);

    expect(updatedBody.data.user).toMatchObject({
      email: registration.email,
      role: 'USER',
      status: 'ACTIVE',
    });
    expect(updatedBody.data.profile).toMatchObject({
      displayName: 'Updated Name',
      currentCefrLevel: 'B2',
      learningGoal: null,
      dailyStudyMinutes: null,
      preferredLanguage: 'vi',
    });

    const laterGet = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(responseBody<MyAccountResponseBody>(laterGet).data.profile).toEqual(
      updatedBody.data.profile,
    );
  });

  it('USR-002 rejects unknown account fields and leaves the profile unchanged', async () => {
    const authenticated = await registerWithRole(registration, 'USER');
    const accessToken = authenticated.data.accessToken;

    for (const attempt of [
      { email: 'other@example.com' },
      { role: 'ADMIN' },
      { status: 'DISABLED' },
    ]) {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(attempt)
        .expect(400);
    }

    const laterGet = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      responseBody<MyAccountResponseBody>(laterGet).data.profile.displayName,
    ).toBe(registration.displayName);
  });

  it.each([
    ['invalid CEFR level', { currentCefrLevel: 'B9' }],
    ['blank display name', { displayName: '   ' }],
    ['empty payload', {}],
    ['explicit null', { avatarUrl: null }],
  ])('USR-002 rejects %s', async (_case, payload) => {
    const authenticated = await registerWithRole(registration, 'USER');
    const accessToken = authenticated.data.accessToken;

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(400);
  });

  it('USR-002 cannot target another user', async () => {
    const firstBody = await registerWithRole(registration, 'USER');
    const secondRegistration = {
      ...registration,
      email: 'second@example.com',
      displayName: 'Second User',
    };
    const secondBody = await registerWithRole(secondRegistration, 'USER');

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${firstBody.data.accessToken}`)
      .send({
        userId: secondBody.data.user.id,
        displayName: 'Compromised',
      })
      .expect(400);

    const secondGet = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${secondBody.data.accessToken}`)
      .expect(200);
    expect(
      responseBody<MyAccountResponseBody>(secondGet).data.profile.displayName,
    ).toBe(secondRegistration.displayName);
  });

  it('AUT-001 registers a normalized USER and starts a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...registration, email: '  User@Example.COM ' })
      .expect(201);

    const body = responseBody<RegistrationResponseBody>(response);
    expect(body).toMatchObject({
      success: true,
      data: {
        user: {
          email: 'user@example.com',
          role: 'USER',
          status: 'ACTIVE',
        },
      },
    });
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie']?.[0]).toContain('refreshToken=');
  });

  it('AUT-001 rejects duplicate email and client-controlled role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'USER@EXAMPLE.COM' })
      .expect(409);
    const roleAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'other@example.com', role: 'ADMIN' })
      .expect(400);

    expect(responseBody<ErrorResponseBody>(duplicate).error.code).toBe(
      'CONFLICT',
    );
    expect(
      responseBody<ErrorResponseBody>(roleAttempt).error.details,
    ).toContain('property role should not exist');
  });

  it('AUT-002 logs in and returns generic errors for bad credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: 'WrongPass@123' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'WrongPass@123' })
      .expect(401);

    expect(responseBody<AuthResponseBody>(login).data.user).not.toHaveProperty(
      'passwordHash',
    );
    expect(responseBody<ErrorResponseBody>(wrongPassword).error.message).toBe(
      'Invalid email or password',
    );
    expect(responseBody<ErrorResponseBody>(unknownEmail).error.message).toBe(
      'Invalid email or password',
    );
  });

  it('AUT-002 rejects suspended and disabled accounts with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);

    for (const status of ['SUSPENDED', 'DISABLED'] as const) {
      repository.setStatusByEmail(registration.email, status);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: registration.email, password: registration.password })
        .expect(403);
    }
  });

  it('AUT-003 rotates a valid refresh token', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send(registration).expect(201);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    const originalCookie = login.headers['set-cookie'][0];
    const refreshed = await agent.post('/api/v1/auth/refresh').expect(200);
    const rotatedCookie = refreshed.headers['set-cookie'][0];

    expect(
      responseBody<AccessTokenResponseBody>(refreshed).data.accessToken,
    ).toEqual(expect.any(String));
    expect(rotatedCookie).not.toBe(originalCookie);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${refreshTokenFromCookie(originalCookie)}`)
      .expect(403);
  });

  it('AUT-003 maps missing tokens to 401 and invalid or expired tokens to 403', async () => {
    const jwtService = new JwtService();
    const expiredToken = await jwtService.signAsync(
      { sub: randomUUID(), type: 'refresh', jti: randomUUID() },
      { secret: authConfig.refreshSecret, expiresIn: -1 },
    );

    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=invalid-token')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${expiredToken}`)
      .expect(403);
  });

  it('AUT-003 rejects refresh for an inactive account', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send(registration).expect(201);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    repository.setStatusByEmail(registration.email, 'DISABLED');

    await agent.post('/api/v1/auth/refresh').expect(403);
  });

  it('AUT-003 rejects an expired server-side refresh session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send(registration).expect(201);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    const refreshToken = refreshTokenFromCookie(login.headers['set-cookie'][0]);
    const payload = await new JwtService().verifyAsync<{ jti: string }>(
      refreshToken,
      { secret: authConfig.refreshSecret },
    );
    repository.expireRefreshSession(refreshTokenHash(payload.jti));

    await agent.post('/api/v1/auth/refresh').expect(403);
  });

  it('AUT-004 clears the cookie and remains idempotent with a valid access token', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send(registration).expect(201);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    const accessToken = responseBody<AuthResponseBody>(login).data.accessToken;
    const refreshCookie = login.headers['set-cookie'][0];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const logout = await agent
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(responseBody<MessageResponseBody>(logout).data.message).toBe(
        'Thao tác thành công.',
      );
    }

    await agent.post('/api/v1/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${refreshTokenFromCookie(refreshCookie)}`)
      .expect(403);
  });

  it('AUT-004 requires a valid access token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
  });

  it('AUT-005 changes the password, clears refresh, and invalidates old credentials', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send(registration).expect(201);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(200);
    const accessToken = responseBody<AuthResponseBody>(login).data.accessToken;
    const refreshCookie = login.headers['set-cookie'][0];

    await agent
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: registration.password,
        newPassword: 'NewStrongPass@456',
      })
      .expect(200);

    await agent.post('/api/v1/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${refreshTokenFromCookie(refreshCookie)}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: 'NewStrongPass@456' })
      .expect(200);
  });

  it('AUT-005 rejects an incorrect current password and a weak new password', async () => {
    const authenticated = await registerWithRole(registration, 'USER');
    const accessToken = authenticated.data.accessToken;

    await request(app.getHttpServer())
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPass@123', newPassword: 'NewPass@123' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: registration.password, newPassword: 'weak' })
      .expect(400);
  });
});
