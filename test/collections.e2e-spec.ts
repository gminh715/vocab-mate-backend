import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CefrLevel, LearningStatus } from '../generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import type { RequestWithUser } from '../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import {
  CollectionNotAccessibleError,
  type CollectionItemsQuery,
  type CollectionListQuery,
  CollectionVocabulariesNotAccessibleError,
  type CreateCollectionInput,
  CollectionsRepository,
  type UpdateCollectionInput,
} from '../src/modules/collections/collections.repository';
import { CollectionItemSort } from '../src/modules/collections/dto/collection-request.dto';

const COLLECTION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_COLLECTION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_COLLECTION_ID = '33333333-3333-4333-8333-333333333333';
const USER_VOCABULARY_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_USER_VOCABULARY_ID = '55555555-5555-4555-8555-555555555555';
const THIRD_USER_VOCABULARY_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_USER_VOCABULARY_ID = '77777777-7777-4777-8777-777777777777';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface StoredCollection {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredVocabulary {
  id: string;
  userId: string;
  articleSentenceTermId: string;
  learningStatus: LearningStatus;
  personalNote: string | null;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedIpa: string | null;
  savedCefrLevel: CefrLevel;
  savedMeaningVi: string;
  savedAt: Date;
  nextReviewAt: Date | null;
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

class TestCollectionsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/u, '');
    if (!token || !['user-a', 'user-b', 'admin'].includes(token)) {
      throw new UnauthorizedException('Access token is invalid');
    }
    request.user = {
      id: token,
      email: `${token}@example.com`,
      role: token === 'admin' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
    };
    return true;
  }
}

class InMemoryCollectionsRepository {
  rows: StoredCollection[] = [];
  memberships = new Map<string, Map<string, Date>>();
  userVocabularies = new Map<string, StoredVocabulary>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.rows = [
      {
        id: COLLECTION_ID,
        userId: 'user-a',
        name: 'Technology',
        description: 'Software and computing words',
        createdAt: new Date('2026-07-23T03:00:00Z'),
        updatedAt: new Date('2026-07-23T03:00:00Z'),
      },
      {
        id: SECOND_COLLECTION_ID,
        userId: 'user-a',
        name: 'Travel',
        description: null,
        createdAt: new Date('2026-07-22T03:00:00Z'),
        updatedAt: new Date('2026-07-22T03:00:00Z'),
      },
      {
        id: OTHER_COLLECTION_ID,
        userId: 'user-b',
        name: 'Private',
        description: 'Other user collection',
        createdAt: new Date('2026-07-24T03:00:00Z'),
        updatedAt: new Date('2026-07-24T03:00:00Z'),
      },
    ];
    this.memberships = new Map([
      [
        COLLECTION_ID,
        new Map([[USER_VOCABULARY_ID, new Date('2026-07-23T05:00:00Z')]]),
      ],
      [
        SECOND_COLLECTION_ID,
        new Map([[USER_VOCABULARY_ID, new Date('2026-07-22T05:00:00Z')]]),
      ],
      [
        OTHER_COLLECTION_ID,
        new Map([[OTHER_USER_VOCABULARY_ID, new Date('2026-07-24T05:00:00Z')]]),
      ],
    ]);
    this.userVocabularies = new Map(
      [
        this.makeVocabulary({
          id: USER_VOCABULARY_ID,
          userId: 'user-a',
          word: 'harmful',
          meaning: 'có hại',
          status: LearningStatus.NEW,
          savedAt: new Date('2026-07-20T03:00:00Z'),
        }),
        this.makeVocabulary({
          id: SECOND_USER_VOCABULARY_ID,
          userId: 'user-a',
          word: 'software',
          meaning: 'phần mềm',
          status: LearningStatus.LEARNING,
          savedAt: new Date('2026-07-21T03:00:00Z'),
        }),
        this.makeVocabulary({
          id: THIRD_USER_VOCABULARY_ID,
          userId: 'user-a',
          word: 'algorithm',
          meaning: 'thuật toán',
          status: LearningStatus.MASTERED,
          savedAt: new Date('2026-07-22T03:00:00Z'),
        }),
        this.makeVocabulary({
          id: OTHER_USER_VOCABULARY_ID,
          userId: 'user-b',
          word: 'private',
          meaning: 'riêng tư',
          status: LearningStatus.NEW,
          savedAt: new Date('2026-07-23T03:00:00Z'),
        }),
      ].map((vocabulary) => [vocabulary.id, vocabulary]),
    );
  }

  list(userId: string, query: CollectionListQuery) {
    const matching = this.rows
      .filter((row) => row.userId === userId)
      .filter(
        (row) =>
          !query.q ||
          row.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      items: matching.slice(start, start + query.limit).map((row) => ({
        ...this.project(row),
        _count: { items: this.memberships.get(row.id)?.size ?? 0 },
      })),
      total: matching.length,
    });
  }

  findOwnedDetail(userId: string, collectionId: string) {
    const row = this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === collectionId,
    );
    return Promise.resolve(
      row
        ? {
            ...this.project(row),
            _count: { items: this.memberships.get(row.id)?.size ?? 0 },
          }
        : null,
    );
  }

  findOwnedId(userId: string, collectionId: string) {
    return Promise.resolve(
      this.rows.some((row) => row.userId === userId && row.id === collectionId)
        ? { id: collectionId }
        : null,
    );
  }

  create(userId: string, input: CreateCollectionInput) {
    if (
      this.rows.some((row) => row.userId === userId && row.name === input.name)
    ) {
      return Promise.reject(
        Object.assign(new Error('unique collection name'), { code: 'P2002' }),
      );
    }
    const row: StoredCollection = {
      id: '55555555-5555-4555-8555-555555555555',
      userId,
      name: input.name,
      description: input.description ?? null,
      createdAt: new Date('2026-07-25T03:00:00Z'),
      updatedAt: new Date('2026-07-25T03:00:00Z'),
    };
    this.rows.push(row);
    this.memberships.set(row.id, new Set());
    return Promise.resolve(this.project(row));
  }

  updateOwned(
    userId: string,
    collectionId: string,
    input: UpdateCollectionInput,
  ) {
    const row = this.rows.find(
      (candidate) =>
        candidate.userId === userId && candidate.id === collectionId,
    );
    if (!row) return Promise.resolve(null);
    if (
      input.name !== undefined &&
      this.rows.some(
        (candidate) =>
          candidate.userId === userId &&
          candidate.id !== collectionId &&
          candidate.name === input.name,
      )
    ) {
      return Promise.reject(
        Object.assign(new Error('unique collection name'), { code: 'P2002' }),
      );
    }
    if (input.name !== undefined) row.name = input.name;
    if (input.description !== undefined) {
      row.description = input.description;
    }
    row.updatedAt = new Date('2026-07-26T03:00:00Z');
    return Promise.resolve(this.project(row));
  }

  deleteOwned(userId: string, collectionId: string) {
    const index = this.rows.findIndex(
      (row) => row.userId === userId && row.id === collectionId,
    );
    if (index < 0) return Promise.resolve(false);
    this.rows.splice(index, 1);
    this.memberships.delete(collectionId);
    return Promise.resolve(true);
  }

  listItems(userId: string, collectionId: string, query: CollectionItemsQuery) {
    const direction = query.sort === CollectionItemSort.OLDEST ? 1 : -1;
    const matching = [...(this.memberships.get(collectionId)?.entries() ?? [])]
      .map(([userVocabularyId, addedAt]) => ({
        addedAt,
        vocabulary: this.userVocabularies.get(userVocabularyId),
      }))
      .filter(
        (item): item is { addedAt: Date; vocabulary: StoredVocabulary } =>
          item.vocabulary?.userId === userId,
      )
      .filter(
        ({ vocabulary }) =>
          !query.q ||
          [
            vocabulary.savedWordDisplay,
            vocabulary.savedLemma,
            vocabulary.savedMeaningVi,
            vocabulary.personalNote ?? '',
          ].some((value) =>
            value.toLocaleLowerCase().includes(query.q!.toLocaleLowerCase()),
          ),
      )
      .filter(
        ({ vocabulary }) =>
          !query.learningStatus ||
          vocabulary.learningStatus === query.learningStatus,
      )
      .sort(
        (left, right) =>
          (left.addedAt.getTime() - right.addedAt.getTime()) * direction ||
          left.vocabulary.id.localeCompare(right.vocabulary.id),
      );
    const start = (query.page - 1) * query.limit;

    return Promise.resolve({
      items: matching.slice(start, start + query.limit).map((item) => ({
        addedAt: item.addedAt,
        userVocabulary: this.projectVocabulary(item.vocabulary),
      })),
      total: matching.length,
    });
  }

  addItems(userId: string, collectionId: string, userVocabularyIds: string[]) {
    const collection = this.rows.find(
      (row) => row.id === collectionId && row.userId === userId,
    );
    if (!collection) {
      return Promise.reject(new CollectionNotAccessibleError());
    }
    if (
      userVocabularyIds.some(
        (id) => this.userVocabularies.get(id)?.userId !== userId,
      )
    ) {
      return Promise.reject(new CollectionVocabulariesNotAccessibleError());
    }

    const memberships = this.memberships.get(collectionId);
    if (!memberships) {
      throw new Error('Collection membership state is missing');
    }
    let count = 0;
    for (const userVocabularyId of userVocabularyIds) {
      if (!memberships.has(userVocabularyId)) {
        memberships.set(userVocabularyId, new Date('2026-07-25T05:00:00Z'));
        count += 1;
      }
    }
    return Promise.resolve({ count });
  }

  deleteOwnedItem(
    userId: string,
    collectionId: string,
    userVocabularyId: string,
  ) {
    const ownsCollection = this.rows.some(
      (row) => row.id === collectionId && row.userId === userId,
    );
    const ownsVocabulary =
      this.userVocabularies.get(userVocabularyId)?.userId === userId;
    if (!ownsCollection || !ownsVocabulary) {
      return Promise.resolve(false);
    }

    return Promise.resolve(
      this.memberships.get(collectionId)?.delete(userVocabularyId) ?? false,
    );
  }

  private project(row: StoredCollection) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private projectVocabulary(vocabulary: StoredVocabulary) {
    const { userId: _userId, ...snapshot } = vocabulary;
    void _userId;
    return snapshot;
  }

  private makeVocabulary(options: {
    id: string;
    userId: string;
    word: string;
    meaning: string;
    status: LearningStatus;
    savedAt: Date;
  }): StoredVocabulary {
    return {
      id: options.id,
      userId: options.userId,
      articleSentenceTermId: options.id,
      learningStatus: options.status,
      personalNote: null,
      savedWordDisplay: options.word,
      savedLemma: options.word,
      savedPartOfSpeech: 'noun',
      savedIpa: null,
      savedCefrLevel: CefrLevel.B1,
      savedMeaningVi: options.meaning,
      savedAt: options.savedAt,
      nextReviewAt: null,
    };
  }
}

describe('Collection APIs (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryCollectionsRepository;

  beforeAll(async () => {
    repository = new InMemoryCollectionsRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(CollectionsRepository)
      .useValue(repository)
      .overrideGuard(JwtAuthGuard)
      .useClass(TestCollectionsAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  beforeEach(() => repository.reset());
  afterAll(async () => app.close());

  it('documents COL-001 through COL-008 with corrected item request and response contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<
        string,
        Record<
          string,
          {
            security: Array<Record<string, string[]>>;
            responses: Record<string, object>;
          }
        >
      >;
      components: {
        schemas: Record<
          string,
          {
            properties: Record<string, { type?: string; maxItems?: number }>;
          }
        >;
      };
    }>(response);

    const collectionPath = swagger.paths['/api/v1/collections'];
    const detailPath = swagger.paths['/api/v1/collections/{collectionId}'];
    const itemsPath = swagger.paths['/api/v1/collections/{collectionId}/items'];
    const itemPath =
      swagger.paths[
        '/api/v1/collections/{collectionId}/items/{userVocabularyId}'
      ];
    expect(collectionPath.get.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(collectionPath.post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '409']),
    );
    expect(Object.keys(detailPath.delete.responses)).toContain('204');
    expect(
      swagger.components.schemas.CollectionDetailDataDto.properties
        .vocabularyCount.type,
    ).toBe('number');
    expect(
      swagger.components.schemas.CollectionDetailDataDto.properties,
    ).not.toHaveProperty('vocabulary');
    expect(itemsPath.get.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(itemsPath.post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '404', '422']),
    );
    expect(Object.keys(itemPath.delete.responses)).toContain('204');
    expect(
      swagger.components.schemas.AddCollectionItemsDto.properties
        .userVocabularyIds,
    ).toMatchObject({ type: 'array', maxItems: 50 });
    expect(
      Object.keys(swagger.components.schemas.AddCollectionItemsDto.properties),
    ).not.toContain('userVocabularyIds[]');
  });

  it('requires authentication for the collection list', async () => {
    await request(app.getHttpServer()).get('/api/v1/collections').expect(401);
  });

  it('lists only the owner with database-style search, counts, and pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/collections?page=1&limit=1&q=%20technology%20')
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: Array<{ id: string; vocabularyCount: number }>;
        meta: { page: number; limit: number; total: number };
      }>
    >(response);

    expect(body.data).toEqual({
      items: [
        expect.objectContaining({
          id: COLLECTION_ID,
          vocabularyCount: 1,
        }),
      ],
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
    expect(JSON.stringify(body)).not.toContain('Private');
    expect(JSON.stringify(body)).not.toContain('userId');
  });

  it('allows ADMIN to operate only on the admin account collections', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/collections')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(
      responseBody<SuccessBody<{ items: unknown[] }>>(response).data.items,
    ).toEqual([]);
  });

  it('creates with normalized input, enforces exact-case uniqueness, and rejects owner fields', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set('Authorization', 'Bearer user-a')
      .send({
        name: '  Difficult Words  ',
        description: '  Review these often  ',
      })
      .expect(201);
    expect(
      responseBody<
        SuccessBody<{
          collection: { name: string; description: string };
        }>
      >(created).data.collection,
    ).toMatchObject({
      name: 'Difficult Words',
      description: 'Review these often',
    });

    await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set('Authorization', 'Bearer user-a')
      .send({ name: 'Difficult Words' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set('Authorization', 'Bearer user-a')
      .send({ name: 'difficult words' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/collections')
      .set('Authorization', 'Bearer user-a')
      .send({ name: 'Injected', userId: 'user-b' })
      .expect(400);
  });

  it('returns detail with vocabularyCount and hides a non-owned collection', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/collections/${COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const detailBody = responseBody<
      SuccessBody<{
        collection: { id: string };
        vocabularyCount: number;
      }>
    >(detail);
    expect(detailBody.data.collection.id).toBe(COLLECTION_ID);
    expect(detailBody.data.vocabularyCount).toBe(1);

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/collections/${OTHER_COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(404);
    expect(responseBody<ErrorBody>(hidden)).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Collection not found' },
    });
  });

  it('supports partial update, explicit clearing, duplicate conflict, and empty-body rejection', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/collections/${COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .send({ description: null })
      .expect(200);
    expect(
      responseBody<
        SuccessBody<{ collection: { name: string; description: null } }>
      >(updated).data.collection,
    ).toMatchObject({ name: 'Technology', description: null });

    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .send({ name: 'Travel' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .send({})
      .expect(400);
  });

  it('returns generic not found for a non-owner update and delete', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${OTHER_COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .send({ name: 'Hidden' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/collections/${OTHER_COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(404);
  });

  it('lists only owner collection items using snapshot search, status, pagination, and added order', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/collections/${COLLECTION_ID}/items?page=1&limit=1&q=%20harm%20&learningStatus=NEW&sort=newest`,
      )
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: Array<{
          id: string;
          savedWordDisplay: string;
          learningStatus: LearningStatus;
          addedAt: string;
        }>;
        meta: { page: number; limit: number; total: number };
      }>
    >(response);

    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: USER_VOCABULARY_ID,
        savedWordDisplay: 'harmful',
        learningStatus: LearningStatus.NEW,
        addedAt: '2026-07-23T05:00:00.000Z',
      }),
    ]);
    expect(body.data.meta).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /contextSentence|articleSentenceTerm":|userId|sourceArticle/,
    );
  });

  it('returns the same collection 404 for missing and non-owned item lists', async () => {
    for (const collectionId of [
      OTHER_COLLECTION_ID,
      '88888888-8888-4888-8888-888888888888',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/collections/${collectionId}/items?page=1&limit=20`)
        .set('Authorization', 'Bearer user-a')
        .expect(404);
      expect(responseBody<ErrorBody>(response)).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Collection not found' },
      });
    }
  });

  it('bulk adds new IDs and counts repeated and existing IDs as skipped', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/collections/${COLLECTION_ID}/items`)
      .set('Authorization', 'Bearer user-a')
      .send({
        userVocabularyIds: [
          USER_VOCABULARY_ID,
          SECOND_USER_VOCABULARY_ID,
          SECOND_USER_VOCABULARY_ID,
        ],
      })
      .expect(201);

    expect(
      responseBody<SuccessBody<{ addedCount: number; skippedCount: number }>>(
        response,
      ).data,
    ).toEqual({ addedCount: 1, skippedCount: 2 });
    expect(
      repository.memberships.get(COLLECTION_ID)?.has(SECOND_USER_VOCABULARY_ID),
    ).toBe(true);

    const existing = await request(app.getHttpServer())
      .post(`/api/v1/collections/${COLLECTION_ID}/items`)
      .set('Authorization', 'Bearer user-a')
      .send({ userVocabularyIds: [SECOND_USER_VOCABULARY_ID] })
      .expect(201);
    expect(
      responseBody<SuccessBody<{ addedCount: number; skippedCount: number }>>(
        existing,
      ).data,
    ).toEqual({ addedCount: 0, skippedCount: 1 });
  });

  it('rejects an invalid or non-owned vocabulary atomically with no partial add', async () => {
    const memberships = repository.memberships.get(COLLECTION_ID);
    const initialCount = memberships?.size;
    const response = await request(app.getHttpServer())
      .post(`/api/v1/collections/${COLLECTION_ID}/items`)
      .set('Authorization', 'Bearer user-a')
      .send({
        userVocabularyIds: [
          SECOND_USER_VOCABULARY_ID,
          OTHER_USER_VOCABULARY_ID,
        ],
      })
      .expect(422);

    expect(responseBody<ErrorBody>(response)).toEqual({
      success: false,
      error: {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'One or more saved vocabularies are unavailable',
      },
    });
    expect(memberships?.size).toBe(initialCount);
    expect(memberships?.has(SECOND_USER_VOCABULARY_ID)).toBe(false);
  });

  it('removes only one relation with an empty 204 while preserving vocabulary and other memberships', async () => {
    const response = await request(app.getHttpServer())
      .delete(
        `/api/v1/collections/${COLLECTION_ID}/items/${USER_VOCABULARY_ID}`,
      )
      .set('Authorization', 'Bearer user-a')
      .expect(204);

    expect(response.text).toBe('');
    expect(
      repository.memberships.get(COLLECTION_ID)?.has(USER_VOCABULARY_ID),
    ).toBe(false);
    expect(repository.userVocabularies.has(USER_VOCABULARY_ID)).toBe(true);
    expect(
      repository.memberships.get(SECOND_COLLECTION_ID)?.has(USER_VOCABULARY_ID),
    ).toBe(true);
  });

  it('prevents another user from accessing or deleting an owner relation', async () => {
    await request(app.getHttpServer())
      .delete(
        `/api/v1/collections/${COLLECTION_ID}/items/${USER_VOCABULARY_ID}`,
      )
      .set('Authorization', 'Bearer user-b')
      .expect(404);
    expect(
      repository.memberships.get(COLLECTION_ID)?.has(USER_VOCABULARY_ID),
    ).toBe(true);
  });

  it('deletes with an empty 204 response while preserving saved vocabulary', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/collections/${COLLECTION_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(204);

    expect(response.text).toBe('');
    expect(repository.memberships.has(COLLECTION_ID)).toBe(false);
    expect(repository.userVocabularies.has(USER_VOCABULARY_ID)).toBe(true);
  });
});
