import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CefrLevel,
  LearningStatus,
  LexicalUnitType,
} from '../../../generated/prisma/enums';
import { AppModule } from '../../../src/app.module';
import { configureApp, setupSwagger } from '../../../src/app.setup';
import { PrismaService } from '../../../src/database/prisma.service';
import type { RequestWithUser } from '../../../src/modules/auth/auth.types';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { ContextualTermsService } from '../../../src/modules/reading/services/contextual-terms.service';
import type {
  CreateVocabularySnapshotInput,
  VocabularyListQuery,
} from '../../../src/modules/vocabularies/repositories/vocabularies.repository';
import {
  InvalidVocabularyCollectionsError,
  VocabulariesRepository,
} from '../../../src/modules/vocabularies/repositories/vocabularies.repository';
import { VocabularySort } from '../../../src/modules/vocabularies/dto/vocabulary-request.dto';

const TERM_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_TERM_ID = '12121212-1212-4121-8121-121212121212';
const SAVE_TERM_ID = '13131313-1313-4131-8131-131313131313';
const VOCABULARY_ID = '22222222-2222-4222-8222-222222222222';
const OWNED_COLLECTION_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_COLLECTION_ID = '44444444-4444-4444-8444-444444444444';
const ARTICLE_ID = '55555555-5555-4555-8555-555555555555';

interface SuccessBody<T> {
  success: true;
  data: T;
}

interface SwaggerOperation {
  security: Array<Record<string, string[]>>;
  responses: Record<string, object>;
  parameters: Array<{
    name: string;
    schema: { type?: string };
  }>;
}

interface SwaggerSchema {
  properties: Record<string, { type?: string }>;
  required?: string[];
}

const responseBody = <T>(response: { text: string }): T =>
  JSON.parse(response.text) as T;

class TestVocabularyAuthGuard implements CanActivate {
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
  savedContextSentence: string;
  savedContextTranslationVi: string;
  savedMeaningVi: string;
  savedExplanation: string | null;
  savedExamples: unknown[];
  savedAt: Date;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  reviewIntervalDays: number | null;
  collectionItems: Array<{
    addedAt: Date;
    collection: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
  articleSentenceTerm: {
    sentence: {
      article: {
        id: string;
        slug: string;
        title: string;
        thumbnailUrl: string | null;
        sourceName: string | null;
        sourceUrl: string | null;
      };
    };
  };
}

class InMemoryVocabulariesRepository {
  readonly rows: StoredVocabulary[] = [
    this.makeRow({
      id: VOCABULARY_ID,
      userId: 'user-a',
      articleSentenceTermId: TERM_ID,
      savedAt: new Date('2026-07-23T01:00:00Z'),
      collectionIds: [OWNED_COLLECTION_ID],
    }),
    this.makeRow({
      id: '66666666-6666-4666-8666-666666666666',
      userId: 'user-b',
      articleSentenceTermId: SECOND_TERM_ID,
      savedAt: new Date('2026-07-22T01:00:00Z'),
      collectionIds: [OTHER_COLLECTION_ID],
    }),
  ];

  list(userId: string, query: VocabularyListQuery, now: Date) {
    const direction = query.sort === VocabularySort.OLDEST ? 1 : -1;
    const matching = this.rows
      .filter((row) => row.userId === userId)
      .filter(
        (row) =>
          !query.q ||
          [
            row.savedWordDisplay,
            row.savedLemma,
            row.savedMeaningVi,
            row.personalNote ?? '',
          ].some((value) =>
            value.toLocaleLowerCase().includes(query.q!.toLocaleLowerCase()),
          ),
      )
      .filter(
        (row) =>
          !query.learningStatus || row.learningStatus === query.learningStatus,
      )
      .filter(
        (row) => !query.cefrLevel || row.savedCefrLevel === query.cefrLevel,
      )
      .filter(
        (row) =>
          !query.collectionId ||
          row.collectionItems.some(
            ({ collection }) => collection.id === query.collectionId,
          ),
      )
      .filter(
        (row) =>
          !query.dueOnly ||
          ([
            LearningStatus.NEW,
            LearningStatus.LEARNING,
            LearningStatus.REVIEWING,
          ].includes(row.learningStatus) &&
            ((row.nextReviewAt?.getTime() ?? Number.POSITIVE_INFINITY) <=
              now.getTime() ||
              (row.learningStatus === LearningStatus.NEW &&
                row.nextReviewAt === null))),
      )
      .sort(
        (left, right) =>
          (left.savedAt.getTime() - right.savedAt.getTime()) * direction ||
          left.id.localeCompare(right.id),
      );
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      items: matching.slice(start, start + query.limit),
      total: matching.length,
    });
  }

  findOwnedById(userId: string, userVocabularyId: string) {
    return Promise.resolve(
      this.rows.find(
        (row) => row.userId === userId && row.id === userVocabularyId,
      ) ?? null,
    );
  }

  createWithCollections(
    userId: string,
    input: CreateVocabularySnapshotInput,
    collectionIds: string[],
  ) {
    const ownedIds =
      userId === 'user-a'
        ? new Set([OWNED_COLLECTION_ID])
        : new Set([OTHER_COLLECTION_ID]);
    if (collectionIds.some((id) => !ownedIds.has(id))) {
      return Promise.reject(new InvalidVocabularyCollectionsError());
    }
    if (
      this.rows.some(
        (row) =>
          row.userId === userId &&
          row.articleSentenceTermId === input.articleSentenceTermId,
      )
    ) {
      return Promise.reject(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
    }

    const row = this.makeRow({
      id: '77777777-7777-4777-8777-777777777777',
      userId,
      articleSentenceTermId: input.articleSentenceTermId,
      savedAt: new Date('2026-07-23T06:00:00Z'),
      collectionIds,
      input,
    });
    this.rows.push(row);
    return Promise.resolve(row);
  }

  private makeRow(options: {
    id: string;
    userId: string;
    articleSentenceTermId: string;
    savedAt: Date;
    collectionIds: string[];
    input?: CreateVocabularySnapshotInput;
  }): StoredVocabulary {
    const input = options.input;
    return {
      id: options.id,
      userId: options.userId,
      articleSentenceTermId: options.articleSentenceTermId,
      learningStatus: input?.learningStatus ?? LearningStatus.NEW,
      personalNote: input?.personalNote ?? null,
      savedWordDisplay: input?.savedWordDisplay ?? 'harmful',
      savedLemma: input?.savedLemma ?? 'harmful',
      savedPartOfSpeech: input?.savedPartOfSpeech ?? 'adjective',
      savedIpa: input?.savedIpa ?? '/ˈhɑːrmfəl/',
      savedCefrLevel: input?.savedCefrLevel ?? CefrLevel.B1,
      savedContextSentence:
        input?.savedContextSentence ?? 'Plastic waste is harmful.',
      savedContextTranslationVi:
        input?.savedContextTranslationVi ?? 'Rác thải nhựa có hại.',
      savedMeaningVi: input?.savedMeaningVi ?? 'có hại',
      savedExplanation: input?.savedExplanation ?? null,
      savedExamples: (input?.savedExamples as unknown[]) ?? [],
      savedAt: options.savedAt,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null,
      collectionItems: options.collectionIds.map((id) => ({
        addedAt: options.savedAt,
        collection: {
          id,
          name:
            id === OWNED_COLLECTION_ID
              ? 'Difficult Words'
              : 'Other User Collection',
          description: null,
        },
      })),
      articleSentenceTerm: {
        sentence: {
          article: {
            id: ARTICLE_ID,
            slug: 'archived-plastic-waste',
            title: 'Archived Plastic Waste',
            thumbnailUrl: null,
            sourceName: 'Vocab Mate News',
            sourceUrl: null,
          },
        },
      },
    };
  }
}

const readingService = {
  getContextualTermForSave: jest.fn((termId: string) =>
    Promise.resolve({
      term: {
        id: termId,
        value: 'harmful',
        wordDisplay: 'harmful',
        lemma: 'harmful',
        unitType: LexicalUnitType.WORD,
        partOfSpeech: 'adjective',
        ipa: '/ˈhɑːrmfəl/',
        cefrLevel: CefrLevel.B1,
        contextualMeaningVi: 'có hại',
        definitionEn: 'causing damage',
        contextualExplanation: null,
        synonyms: [],
        antonyms: [],
        collocations: [],
        relatedTerms: [],
        vocabularyTopic: null,
        examples: [],
        skill: null,
      },
      parentSentence: {
        id: '88888888-8888-4888-8888-888888888888',
        sentenceOrder: 1,
        sentenceText: 'Plastic waste is harmful.',
        translationVi: 'Rác thải nhựa có hại.',
        explanationVi: null,
        referenceExplanation: null,
        skill: null,
        contentVersion: 1,
      },
      sourceArticle: { id: ARTICLE_ID, contentVersion: 1 },
      isLookupEnabled: true,
    }),
  ),
};

describe('Vocabulary APIs (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryVocabulariesRepository;

  beforeAll(async () => {
    repository = new InMemoryVocabulariesRepository();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(VocabulariesRepository)
      .useValue(repository)
      .overrideProvider(ContextualTermsService)
      .useValue(readingService)
      .overrideGuard(JwtAuthGuard)
      .useClass(TestVocabularyAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('documents VOC-001 through VOC-003 with corrected boolean and array contracts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const swagger = responseBody<{
      paths: Record<string, Record<string, SwaggerOperation>>;
      components: { schemas: Record<string, SwaggerSchema> };
    }>(response);
    const path = swagger.paths['/api/v1/vocabularies'];
    expect(path.get.security).toContainEqual({ BearerAuth: [] });
    expect(path.post.security).toContainEqual({ BearerAuth: [] });
    expect(Object.keys(path.post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '404', '409', '422']),
    );
    const dueOnly = path.get.parameters.find(
      ({ name }: { name: string }) => name === 'dueOnly',
    );
    expect(dueOnly.schema.type).toBe('boolean');
    expect(
      swagger.components.schemas.SaveVocabularyDto.properties.collectionIds
        .type,
    ).toBe('array');
    expect(swagger.components.schemas.SaveVocabularyDto.required).toContain(
      'collectionIds',
    );
    expect(
      swagger.components.schemas.VocabularyDetailDataDto.properties.collections
        .type,
    ).toBe('array');
    expect(
      swagger.components.schemas.VocabularySaveDataDto.properties.collections
        .type,
    ).toBe('array');
  });

  it('requires authentication for the vocabulary list', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vocabularies?page=1&limit=20')
      .expect(401);
  });

  it('allows ADMIN to use the normal learning vocabulary scope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/vocabularies?page=1&limit=20')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    const body =
      responseBody<SuccessBody<{ items: unknown[]; meta: { total: number } }>>(
        response,
      );

    expect(body.data).toMatchObject({ items: [], meta: { total: 0 } });
  });

  it('lists only the authenticated owner with filters and pagination', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/vocabularies?page=1&limit=1&q=harmful&learningStatus=NEW&cefrLevel=B1&collectionId=${OWNED_COLLECTION_ID}&dueOnly=true&sort=newest`,
      )
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        items: Array<{ id: string; savedWordDisplay: string }>;
        meta: { total: number; page: number; limit: number };
      }>
    >(response);

    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: VOCABULARY_ID,
        savedWordDisplay: 'harmful',
      }),
    ]);
    expect(body.data.meta).toEqual(
      expect.objectContaining({ total: 1, page: 1, limit: 1 }),
    );
  });

  it('hides another user vocabulary with generic not found', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/vocabularies/${VOCABULARY_ID}`)
      .set('Authorization', 'Bearer user-b')
      .expect(404);
  });

  it('returns snapshot detail, collections array, and lightweight archived source navigation', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/vocabularies/${VOCABULARY_ID}`)
      .set('Authorization', 'Bearer user-a')
      .expect(200);
    const body = responseBody<
      SuccessBody<{
        vocabulary: { savedMeaningVi: string };
        collections: unknown[];
        sourceArticle: { slug: string };
      }>
    >(response);

    expect(body.data).toMatchObject({
      vocabulary: { savedMeaningVi: 'có hại' },
      sourceArticle: { slug: 'archived-plastic-waste' },
    });
    expect(body.data.collections).toHaveLength(1);
    expect(JSON.stringify(body.data.sourceArticle)).not.toMatch(
      /contentHtml|sentences|terms|createdBy|updatedBy/,
    );
  });

  it('saves atomically as NEW and maps a duplicate to conflict', async () => {
    const requestBody = {
      articleSentenceTermId: SAVE_TERM_ID,
      personalNote: '  Remember this  ',
      collectionIds: [OWNED_COLLECTION_ID, OWNED_COLLECTION_ID],
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/vocabularies')
      .set('Authorization', 'Bearer user-a')
      .send(requestBody)
      .expect(201);
    const body = responseBody<
      SuccessBody<{
        vocabulary: {
          learningStatus: LearningStatus;
          personalNote: string;
          nextReviewAt: null;
        };
        collections: unknown[];
      }>
    >(first);

    expect(body.data.vocabulary).toMatchObject({
      learningStatus: LearningStatus.NEW,
      personalNote: 'Remember this',
      nextReviewAt: null,
    });
    expect(body.data.collections).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/vocabularies')
      .set('Authorization', 'Bearer user-a')
      .send(requestBody)
      .expect(409);
  });

  it('rejects non-owned collection attachment without a partial vocabulary', async () => {
    const initialCount = repository.rows.length;
    await request(app.getHttpServer())
      .post('/api/v1/vocabularies')
      .set('Authorization', 'Bearer user-a')
      .send({
        articleSentenceTermId: '99999999-9999-4999-8999-999999999999',
        collectionIds: [OTHER_COLLECTION_ID],
      })
      .expect(422);

    expect(repository.rows).toHaveLength(initialCount);
  });

  it('rejects saving vocabulary without at least one collection', async () => {
    for (const body of [
      { articleSentenceTermId: SECOND_TERM_ID },
      { articleSentenceTermId: SECOND_TERM_ID, collectionIds: [] },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/vocabularies')
        .set('Authorization', 'Bearer user-a')
        .send(body)
        .expect(400);
    }
  });

  it('rejects a scalar collectionId and client-controlled snapshot fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vocabularies')
      .set('Authorization', 'Bearer user-a')
      .send({
        articleSentenceTermId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        collectionIds: OWNED_COLLECTION_ID,
        learningStatus: 'MASTERED',
      })
      .expect(400);
  });
});
