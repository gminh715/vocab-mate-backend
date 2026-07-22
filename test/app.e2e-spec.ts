import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import type { AuthConfig } from '../src/config/auth.config';
import { AUTH_CONFIG } from '../src/config/config.module';
import { PrismaService } from '../src/database/prisma.service';
import type {
  AuthUserRecord,
  CreateRegisteredUserInput,
  PublicUserRecord,
} from '../src/modules/users/users.repository';
import { UsersRepository } from '../src/modules/users/users.repository';

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

interface ErrorResponseBody {
  success: false;
  error: { code: string; message: string; details?: string[] };
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

class InMemoryUsersRepository {
  private readonly users = new Map<string, AuthUserRecord>();

  reset(): void {
    this.users.clear();
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
    return Promise.resolve(this.toSafeUser(user));
  }

  updateLastLogin(id: string): Promise<PublicUserRecord> {
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

  private requiredSafeUser(id: string): PublicUserRecord {
    const user = this.users.get(id);

    if (!user) {
      throw new Error('user not found');
    }

    return this.toSafeUser(user);
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

describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryUsersRepository;

  beforeAll(async () => {
    repository = new InMemoryUsersRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(authConfig)
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => repository.reset());

  afterAll(async () => app.close());

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
