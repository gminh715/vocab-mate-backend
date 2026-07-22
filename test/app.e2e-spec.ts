import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import type { AuthConfig } from '../src/config/auth.config';
import { AUTH_CONFIG } from '../src/config/config.module';
import { PrismaService } from '../src/database/prisma.service';
import {
  type AdminCategoryRecord,
  CategoriesRepository,
  type PublicCategoryRecord,
} from '../src/modules/categories/categories.repository';
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
} from '../src/modules/users/users.repository';
import { UsersRepository } from '../src/modules/users/users.repository';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository';

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
  currentCefrLevel: 'B1',
  learningGoal: 'Learn 10 words per day',
};

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

class InMemoryUsersRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly profiles = new Map<string, UserProfileRecord>();
  private readonly accountDates = new Map<
    string,
    { createdAt: Date; lastLoginAt: Date | null; updatedAt: Date }
  >();

  reset(): void {
    this.users.clear();
    this.profiles.clear();
    this.accountDates.clear();
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
      currentCefrLevel: input.currentCefrLevel,
      learningGoal: input.learningGoal ?? null,
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
    return Promise.resolve(this.toSafeUser(user));
  }

  setStatusByEmail(email: string, status: AuthUserRecord['status']): void {
    const user = [...this.users.values()].find(
      (candidate) => candidate.email === email,
    );

    if (user) {
      user.status = status;
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

  beforeAll(async () => {
    repository = new InMemoryUsersRepository();
    categoriesRepository = new InMemoryCategoriesRepository();
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
      .overrideGuard(ThrottlerGuard)
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
  });

  afterAll(async () => app.close());

  const registerWithRole = async (
    input: typeof registration,
    role: 'ADMIN' | 'USER',
  ): Promise<AuthResponseBody> => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    repository.setRoleByEmail(input.email, role);

    if (role === 'USER') {
      return responseBody<AuthResponseBody>(registered);
    }

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    return responseBody<AuthResponseBody>(login);
  };

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
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;
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
        currentCefrLevel: registration.currentCefrLevel,
        learningGoal: registration.learningGoal,
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
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;
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
      learningGoal: registration.learningGoal,
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
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;

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
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(400);
  });

  it('USR-002 cannot target another user', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const secondRegistration = {
      ...registration,
      email: 'second@example.com',
      displayName: 'Second User',
    };
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(secondRegistration)
      .expect(201);
    const firstBody = responseBody<AuthResponseBody>(first);
    const secondBody = responseBody<AuthResponseBody>(second);

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

  it('AUT-001 registers a normalized USER and sets an HttpOnly refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...registration, email: '  User@Example.COM ' })
      .expect(201);

    const body = responseBody<AuthResponseBody>(response);
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
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
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
    const registered = await agent
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const originalCookie = registered.headers['set-cookie'][0];
    const refreshed = await agent.post('/api/v1/auth/refresh').expect(200);
    const rotatedCookie = refreshed.headers['set-cookie'][0];

    expect(
      responseBody<AccessTokenResponseBody>(refreshed).data.accessToken,
    ).toEqual(expect.any(String));
    expect(rotatedCookie).not.toBe(originalCookie);
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
    repository.setStatusByEmail(registration.email, 'DISABLED');

    await agent.post('/api/v1/auth/refresh').expect(403);
  });

  it('AUT-004 clears the cookie and remains idempotent with a valid access token', async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;

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
  });

  it('AUT-004 requires a valid access token', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
  });

  it('AUT-005 changes the password, clears refresh, and invalidates old credentials', async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;

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
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: registration.password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registration.email, password: 'NewStrongPass@456' })
      .expect(200);
  });

  it('AUT-005 rejects an incorrect current password and a weak new password', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registration)
      .expect(201);
    const accessToken =
      responseBody<AuthResponseBody>(registered).data.accessToken;

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
