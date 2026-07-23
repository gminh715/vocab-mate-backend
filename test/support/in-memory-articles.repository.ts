import type {
  AdminArticleDetailRecord,
  AdminArticleListQuery,
  AdminArticleListRecord,
  AdminArticleListResult,
  AdminArticleRecord,
  ArticleDeleteSafetyRecord,
  ArticleMutationState,
  ArticlePublicationSnapshot,
  ArticleSentenceDetailRecord,
  ArticleSentenceListResult,
  ArticleSentenceRecord,
  ArticleSentenceTermRecord,
  ArticleTermDetailRecord,
  ArticleTermListResult,
  ArticleTermMutationContext,
  ArticleStatusTransitionInput,
  ArticleStatusTransitionRecord,
  CreateArticleTermInput,
  CreateArticleInput,
  FindPublishedArticlesQuery,
  PublicArticleCardRecord,
  PublicArticleDetailRecord,
  PublicArticleListResult,
  ReplaceParsedContentInput,
  SentenceTermContext,
  TermMarkerWriteInput,
  UpdateArticleTermInput,
  UpdateArticleSentenceInput,
  UpdateArticleInput,
} from '../../src/modules/articles/repositories/articles.repository';
import {
  ArticleStatusTransitionConflictError,
  ArticleTermReferencedError,
  ArticleTermStateConflictError,
} from '../../src/modules/articles/repositories/articles.repository';
import { randomUUID } from 'node:crypto';

interface QuizFixture {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

interface ArticleFixture {
  id: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: Date | null;
  archivedAt?: Date | null;
  contentVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
  category: { id: string; name: string; slug: string; isActive?: boolean };
  quizzes: QuizFixture[];
}

interface SentenceFixture extends ArticleSentenceRecord {
  updatedByUserId: string;
}

interface TermFixture extends ArticleSentenceTermRecord {
  updatedByUserId: string;
}

export class InMemoryArticlesRepository {
  private articles: ArticleFixture[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'How Technology Changes Learning',
      slug: 'how-technology-changes-learning',
      summary: 'Digital tools are changing modern classrooms.',
      contentHtml: '<p>Private reader payload.</p>',
      sourceName: 'Vocab Mate News',
      sourceUrl: 'https://example.com/technology-learning',
      authorName: 'Jane Doe',
      thumbnailUrl: 'https://cdn.example.com/technology.jpg',
      cefrLevel: 'B1',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-07-22T10:00:00Z'),
      category: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Technology',
        slug: 'technology',
      },
      quizzes: [
        { status: 'PUBLISHED' },
        { status: 'PUBLISHED' },
        { status: 'DRAFT' },
        { status: 'ARCHIVED' },
      ],
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'The Modern Classroom',
      slug: 'the-modern-classroom',
      summary: 'Students explore collaboration with digital tools.',
      contentHtml: '<p>Private modern classroom content.</p>',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B1',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-07-22T10:00:00Z'),
      category: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Technology',
        slug: 'technology',
      },
      quizzes: [{ status: 'DRAFT' }],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Why the Sky Looks Blue',
      slug: 'why-the-sky-looks-blue',
      summary: 'A short science explanation for learners.',
      contentHtml: '<p>Private science content.</p>',
      sourceName: 'Science Weekly',
      sourceUrl: null,
      authorName: 'John Smith',
      thumbnailUrl: null,
      cefrLevel: 'A2',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-07-20T10:00:00Z'),
      category: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Science',
        slug: 'science',
      },
      quizzes: [{ status: 'PUBLISHED' }],
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Draft Article',
      slug: 'draft-article',
      summary: 'This must remain private.',
      contentHtml: '<p>Draft content.</p>',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'B2',
      status: 'DRAFT',
      publishedAt: null,
      category: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Technology',
        slug: 'technology',
      },
      quizzes: [{ status: 'PUBLISHED' }],
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      title: 'Archived Article',
      slug: 'archived-article',
      summary: 'This must also remain private.',
      contentHtml: '<p>Archived content.</p>',
      sourceName: null,
      sourceUrl: null,
      authorName: null,
      thumbnailUrl: null,
      cefrLevel: 'C1',
      status: 'ARCHIVED',
      publishedAt: new Date('2026-07-01T10:00:00Z'),
      archivedAt: new Date('2026-07-15T10:00:00Z'),
      category: {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Inactive Category',
        slug: 'inactive-category',
        isActive: false,
      },
      quizzes: [{ status: 'PUBLISHED' }],
    },
  ];
  private readonly baseline = structuredClone(this.articles);
  private readonly deleteSafety = new Map<
    string,
    Partial<Omit<ArticleDeleteSafetyRecord, 'id' | 'status'>>
  >();
  private sentences: SentenceFixture[] = [];
  private terms: TermFixture[] = [];
  private failParseAfterMutation = false;
  private failTermWriteAfterMutation = false;
  private failStatusTransition = false;
  private readonly termReferences = new Set<string>();

  reset(): void {
    this.articles = structuredClone(this.baseline);
    this.deleteSafety.clear();
    this.sentences = [];
    this.terms = [];
    this.failParseAfterMutation = false;
    this.failTermWriteAfterMutation = false;
    this.failStatusTransition = false;
    this.termReferences.clear();
  }

  failNextParse(): void {
    this.failParseAfterMutation = true;
  }

  failNextTermWrite(): void {
    this.failTermWriteAfterMutation = true;
  }

  failNextStatusTransition(): void {
    this.failStatusTransition = true;
  }

  setTermReferenced(termId: string): void {
    this.termReferences.add(termId);
  }

  setDeleteSafety(
    articleId: string,
    safety: Partial<Omit<ArticleDeleteSafetyRecord, 'id' | 'status'>>,
  ): void {
    this.deleteSafety.set(articleId, safety);
  }

  findPublished(
    query: FindPublishedArticlesQuery,
  ): Promise<PublicArticleListResult> {
    const q = query.q?.toLowerCase();
    const filtered = this.articles
      .filter(({ status }) => status === 'PUBLISHED')
      .filter(
        ({ title, summary }) =>
          !q ||
          title.toLowerCase().includes(q) ||
          summary.toLowerCase().includes(q),
      )
      .filter(
        ({ category }) =>
          !query.categorySlug || category.slug === query.categorySlug,
      )
      .filter(
        ({ cefrLevel }) => !query.cefrLevel || cefrLevel === query.cefrLevel,
      )
      .sort((left, right) => {
        const publishedDifference =
          (left.publishedAt?.getTime() ?? 0) -
          (right.publishedAt?.getTime() ?? 0);
        const primary =
          query.sort === 'oldest' ? publishedDifference : -publishedDifference;
        return primary || left.id.localeCompare(right.id);
      });
    const start = (query.page - 1) * query.limit;

    return Promise.resolve({
      items: filtered
        .slice(start, start + query.limit)
        .map((article) => this.toCard(article)),
      total: filtered.length,
    });
  }

  findPublishedBySlug(slug: string): Promise<PublicArticleDetailRecord | null> {
    const article = this.articles.find(
      (candidate) =>
        candidate.slug === slug && candidate.status === 'PUBLISHED',
    );

    if (!article) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      article: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        sourceName: article.sourceName,
        sourceUrl: article.sourceUrl,
        authorName: article.authorName,
        thumbnailUrl: article.thumbnailUrl,
        cefrLevel: article.cefrLevel,
        status: 'PUBLISHED',
        publishedAt: article.publishedAt,
      },
      category: { ...article.category },
      quizCount: article.quizzes.filter(({ status }) => status === 'PUBLISHED')
        .length,
    });
  }

  findAdminArticles(
    query: AdminArticleListQuery,
  ): Promise<AdminArticleListResult> {
    const q = query.q?.toLowerCase();
    const direction = query.sort === 'oldest' ? 1 : -1;
    const filtered = [...this.articles]
      .filter(
        (article) =>
          !q ||
          article.title.toLowerCase().includes(q) ||
          article.summary.toLowerCase().includes(q),
      )
      .filter(
        (article) =>
          !query.categoryId || article.category.id === query.categoryId,
      )
      .filter(
        (article) => !query.cefrLevel || article.cefrLevel === query.cefrLevel,
      )
      .filter((article) => !query.status || article.status === query.status)
      .sort((left, right) => {
        const dateDifference =
          this.createdAt(left).getTime() - this.createdAt(right).getTime();
        return dateDifference * direction || left.id.localeCompare(right.id);
      });
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      items: filtered
        .slice(start, start + query.limit)
        .map((article) => this.toAdminList(article)),
      total: filtered.length,
    });
  }

  findAdminArticleDetail(
    articleId: string,
  ): Promise<AdminArticleDetailRecord | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    return Promise.resolve(
      article
        ? {
            article: this.toAdmin(article),
            sentenceCount: this.sentences.filter(
              (sentence) =>
                sentence.articleId === articleId &&
                sentence.contentVersion === (article.contentVersion ?? 1) &&
                sentence.isActive,
            ).length,
            termCount: this.terms.filter((term) => {
              const sentence = this.sentences.find(
                (candidate) => candidate.id === term.sentenceId,
              );
              return (
                term.isActive &&
                sentence?.articleId === articleId &&
                sentence.contentVersion === (article.contentVersion ?? 1) &&
                sentence.isActive
              );
            }).length,
            quizCount: article.quizzes.length,
          }
        : null,
    );
  }

  findPublicationSnapshot(
    articleId: string,
  ): Promise<ArticlePublicationSnapshot | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) return Promise.resolve(null);
    const contentVersion = article.contentVersion ?? 1;
    const sentences = this.sentences
      .filter(
        (sentence) =>
          sentence.articleId === articleId &&
          sentence.contentVersion === contentVersion,
      )
      .sort(
        (left, right) =>
          left.sentenceOrder - right.sentenceOrder ||
          left.id.localeCompare(right.id),
      )
      .map((sentence) => ({
        ...this.toSentence(sentence),
        terms: this.terms
          .filter((term) => term.sentenceId === sentence.id)
          .sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime() ||
              left.id.localeCompare(right.id),
          )
          .map(this.toTerm),
      }));
    return Promise.resolve({
      article: {
        id: article.id,
        categoryId: article.category.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        contentHtml: article.contentHtml,
        contentVersion,
        sourceName: article.sourceName,
        sourceUrl: article.sourceUrl,
        authorName: article.authorName,
        thumbnailUrl: article.thumbnailUrl,
        cefrLevel: article.cefrLevel,
        status: article.status,
        publishedAt: article.publishedAt,
        archivedAt: article.archivedAt ?? null,
        category: {
          id: article.category.id,
          name: article.category.name,
          slug: article.category.slug,
          isActive: article.category.isActive ?? true,
        },
      },
      sentences,
    });
  }

  create(input: CreateArticleInput): Promise<AdminArticleRecord> {
    if (
      this.articles.some(
        ({ slug }) => slug.toLowerCase() === input.slug.toLowerCase(),
      )
    ) {
      return Promise.reject(
        Object.assign(new Error('duplicate'), { code: 'P2002' }),
      );
    }
    const now = new Date();
    const article: ArticleFixture = {
      id: randomUUID(),
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      contentHtml: input.contentHtml,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      authorName: input.authorName ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      cefrLevel: input.cefrLevel,
      status: 'DRAFT',
      publishedAt: null,
      archivedAt: null,
      contentVersion: 1,
      createdAt: now,
      updatedAt: now,
      category: this.categoryForId(input.categoryId),
      quizzes: [],
    };
    this.articles.push(article);
    return Promise.resolve(this.toAdmin(article));
  }

  findMutationState(articleId: string): Promise<ArticleMutationState | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    return Promise.resolve(
      article
        ? {
            id: article.id,
            status: article.status,
            contentHtml: article.contentHtml,
            contentVersion: article.contentVersion ?? 1,
          }
        : null,
    );
  }

  countSentences(articleId: string, contentVersion: number): Promise<number> {
    return Promise.resolve(
      this.sentences.filter(
        (sentence) =>
          sentence.articleId === articleId &&
          sentence.contentVersion === contentVersion,
      ).length,
    );
  }

  replaceParsedContent(input: ReplaceParsedContentInput): Promise<void> {
    const article = this.articles.find(
      (candidate) =>
        candidate.id === input.articleId &&
        (candidate.contentVersion ?? 1) === input.contentVersion &&
        candidate.contentHtml === input.sourceContentHtml &&
        candidate.status !== 'ARCHIVED',
    );
    if (!article)
      return Promise.reject(new Error('Article parse state conflict'));

    const previousHtml = article.contentHtml;
    const previousSentences = structuredClone(this.sentences);
    const previousTerms = structuredClone(this.terms);
    const replacedSentenceIds = new Set(
      this.sentences
        .filter(
          (sentence) =>
            sentence.articleId === input.articleId &&
            sentence.contentVersion === input.contentVersion,
        )
        .map(({ id }) => id),
    );
    const now = new Date();
    article.contentHtml = input.annotatedContentHtml;
    this.sentences = this.sentences.filter(
      (sentence) =>
        sentence.articleId !== input.articleId ||
        sentence.contentVersion !== input.contentVersion,
    );
    this.sentences.push(
      ...input.sentences.map((sentence) => ({
        ...sentence,
        articleId: input.articleId,
        contentVersion: input.contentVersion,
        translationVi: null,
        explanationVi: null,
        referenceExplanation: null,
        skill: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        updatedByUserId: input.actingAdminId,
      })),
    );
    this.terms = this.terms.filter(
      (term) => !replacedSentenceIds.has(term.sentenceId),
    );

    if (this.failParseAfterMutation) {
      this.failParseAfterMutation = false;
      article.contentHtml = previousHtml;
      this.sentences = previousSentences;
      this.terms = previousTerms;
      return Promise.reject(new Error('simulated transaction failure'));
    }
    return Promise.resolve();
  }

  findSentences(
    articleId: string,
    query: { page: number; limit: number; isActive?: boolean },
  ): Promise<ArticleSentenceListResult | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) return Promise.resolve(null);
    const contentVersion = article.contentVersion ?? 1;
    const filtered = this.sentences
      .filter(
        (sentence) =>
          sentence.articleId === articleId &&
          sentence.contentVersion === contentVersion &&
          (query.isActive === undefined ||
            sentence.isActive === query.isActive),
      )
      .sort(
        (left, right) =>
          left.sentenceOrder - right.sentenceOrder ||
          left.id.localeCompare(right.id),
      );
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      contentVersion,
      items: filtered.slice(start, start + query.limit).map(this.toSentence),
      total: filtered.length,
    });
  }

  findSentenceDetail(
    articleId: string,
    sentenceId: string,
  ): Promise<ArticleSentenceDetailRecord | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.id === sentenceId &&
        candidate.articleId === articleId &&
        candidate.contentVersion === (article?.contentVersion ?? 0),
    );
    return Promise.resolve(
      sentence ? { sentence: this.toSentence(sentence), terms: [] } : null,
    );
  }

  updateSentence(
    articleId: string,
    sentenceId: string,
    input: UpdateArticleSentenceInput,
  ): Promise<ArticleSentenceRecord | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.id === sentenceId &&
        candidate.articleId === articleId &&
        candidate.contentVersion === (article?.contentVersion ?? 0),
    );
    if (!sentence) return Promise.resolve(null);
    Object.assign(sentence, input, { updatedAt: new Date() });
    return Promise.resolve(this.toSentence(sentence));
  }

  findSentenceTermContext(
    articleId: string,
    sentenceId: string,
  ): Promise<SentenceTermContext | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.id === sentenceId &&
        candidate.articleId === articleId &&
        candidate.contentVersion === (article?.contentVersion ?? 0),
    );
    return Promise.resolve(
      article && sentence
        ? {
            article: {
              id: article.id,
              status: article.status,
              contentHtml: article.contentHtml,
              contentVersion: article.contentVersion ?? 1,
            },
            sentence: this.toSentence(sentence),
          }
        : null,
    );
  }

  createTermWithMarker(
    marker: TermMarkerWriteInput,
    input: CreateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord> {
    const article = this.articleForMarker(marker);
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.id === marker.sentenceId &&
        candidate.articleId === marker.articleId &&
        candidate.contentVersion === marker.contentVersion &&
        candidate.isActive,
    );
    if (!article || !sentence) {
      return Promise.reject(new ArticleTermStateConflictError());
    }
    if (
      this.terms.some(
        (term) =>
          term.sentenceId === input.sentenceId &&
          term.value.trim().toLocaleLowerCase('en-US') ===
            input.value.trim().toLocaleLowerCase('en-US') &&
          term.partOfSpeech === input.partOfSpeech &&
          term.unitType === input.unitType,
      )
    ) {
      return Promise.reject(
        Object.assign(new Error('duplicate'), { code: 'P2002' }),
      );
    }

    const previousHtml = article.contentHtml;
    const previousTerms = structuredClone(this.terms);
    article.contentHtml = marker.updatedContentHtml;
    const now = new Date();
    const term: TermFixture = {
      id: input.id,
      sentenceId: input.sentenceId,
      value: input.value,
      wordDisplay: input.wordDisplay,
      lemma: input.lemma,
      normalizedLemma: input.normalizedLemma,
      unitType: input.unitType,
      partOfSpeech: input.partOfSpeech,
      ipa: input.ipa ?? null,
      cefrLevel: input.cefrLevel,
      contextualMeaningVi: input.contextualMeaningVi,
      definitionEn: input.definitionEn ?? null,
      contextualExplanation: input.contextualExplanation ?? null,
      synonyms: [...input.synonyms],
      antonyms: [...input.antonyms],
      collocations: [...input.collocations],
      relatedTerms: [...input.relatedTerms],
      vocabularyTopic: input.vocabularyTopic ?? null,
      examples: structuredClone(
        input.examples,
      ) as ArticleSentenceTermRecord['examples'],
      skill: input.skill ?? null,
      isLookupEnabled: input.isLookupEnabled,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
      updatedByUserId: input.updatedByUserId,
    };
    this.terms.push(term);
    if (this.failTermWriteAfterMutation) {
      this.failTermWriteAfterMutation = false;
      article.contentHtml = previousHtml;
      this.terms = previousTerms;
      return Promise.reject(new Error('simulated term transaction failure'));
    }
    return Promise.resolve(this.toTerm(term));
  }

  findTerms(
    articleId: string,
    query: {
      page: number;
      limit: number;
      sentenceId?: string;
      cefrLevel?: ArticleSentenceTermRecord['cefrLevel'];
      unitType?: ArticleSentenceTermRecord['unitType'];
      isActive?: boolean;
      q?: string;
    },
  ): Promise<ArticleTermListResult | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) return Promise.resolve(null);
    const version = article.contentVersion ?? 1;
    const currentSentences = new Map(
      this.sentences
        .filter(
          (sentence) =>
            sentence.articleId === articleId &&
            sentence.contentVersion === version,
        )
        .map((sentence) => [sentence.id, sentence]),
    );
    const q = query.q?.toLocaleLowerCase('en-US');
    const filtered = this.terms
      .filter((term) => currentSentences.has(term.sentenceId))
      .filter(
        (term) => !query.sentenceId || term.sentenceId === query.sentenceId,
      )
      .filter((term) => !query.cefrLevel || term.cefrLevel === query.cefrLevel)
      .filter((term) => !query.unitType || term.unitType === query.unitType)
      .filter(
        (term) =>
          query.isActive === undefined || term.isActive === query.isActive,
      )
      .filter(
        (term) =>
          !q ||
          [
            term.value,
            term.wordDisplay,
            term.lemma,
            term.normalizedLemma,
            term.partOfSpeech,
          ].some((value) => value.toLocaleLowerCase('en-US').includes(q)),
      )
      .sort((left, right) => {
        const sentenceDifference =
          (currentSentences.get(left.sentenceId)?.sentenceOrder ?? 0) -
          (currentSentences.get(right.sentenceId)?.sentenceOrder ?? 0);
        return (
          sentenceDifference ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
        );
      });
    const start = (query.page - 1) * query.limit;
    return Promise.resolve({
      contentVersion: version,
      total: filtered.length,
      items: filtered.slice(start, start + query.limit).map((term) => ({
        ...this.toTerm(term),
        sentenceOrder:
          currentSentences.get(term.sentenceId)?.sentenceOrder ?? 0,
        hasDefinitionEn: Boolean(term.definitionEn),
        hasContextualExplanation: Boolean(term.contextualExplanation),
        hasExamples: Array.isArray(term.examples) && term.examples.length > 0,
      })),
    });
  }

  findTermDetail(
    articleId: string,
    termId: string,
  ): Promise<ArticleTermDetailRecord | null> {
    const context = this.termContext(articleId, termId);
    return Promise.resolve(
      context
        ? {
            term: this.toTerm(context.term),
            sentence: this.toSentence(context.sentence),
          }
        : null,
    );
  }

  findTermMutationContext(
    articleId: string,
    termId: string,
  ): Promise<ArticleTermMutationContext | null> {
    const context = this.termContext(articleId, termId);
    return Promise.resolve(
      context
        ? {
            article: {
              id: context.article.id,
              status: context.article.status,
              contentHtml: context.article.contentHtml,
              contentVersion: context.article.contentVersion ?? 1,
            },
            term: this.toTerm(context.term),
            sentence: this.toSentence(context.sentence),
          }
        : null,
    );
  }

  updateTermMetadata(
    articleId: string,
    contentVersion: number,
    termId: string,
    input: UpdateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord | null> {
    const context = this.termContext(articleId, termId);
    if (
      !context ||
      context.article.status === 'ARCHIVED' ||
      (context.article.contentVersion ?? 1) !== contentVersion
    ) {
      return Promise.resolve(null);
    }
    this.applyTermUpdate(context.term, input);
    return Promise.resolve(this.toTerm(context.term));
  }

  updateTermWithMarker(
    marker: TermMarkerWriteInput,
    input: UpdateArticleTermInput,
  ): Promise<ArticleSentenceTermRecord> {
    const article = this.articleForMarker(marker);
    const context = this.termContext(marker.articleId, marker.termId);
    if (!article || !context || !context.sentence.isActive) {
      return Promise.reject(new ArticleTermStateConflictError());
    }
    const previousHtml = article.contentHtml;
    const previousTerm = structuredClone(context.term);
    article.contentHtml = marker.updatedContentHtml;
    this.applyTermUpdate(context.term, input);
    if (this.failTermWriteAfterMutation) {
      this.failTermWriteAfterMutation = false;
      article.contentHtml = previousHtml;
      Object.assign(context.term, previousTerm);
      return Promise.reject(new Error('simulated term transaction failure'));
    }
    return Promise.resolve(this.toTerm(context.term));
  }

  deleteTermWithMarker(marker: TermMarkerWriteInput): Promise<void> {
    if (this.termReferences.has(marker.termId)) {
      return Promise.reject(new ArticleTermReferencedError());
    }
    const article = this.articleForMarker(marker);
    const index = this.terms.findIndex(({ id }) => id === marker.termId);
    if (!article || index < 0) {
      return Promise.reject(new ArticleTermStateConflictError());
    }
    const previousHtml = article.contentHtml;
    const previousTerms = structuredClone(this.terms);
    article.contentHtml = marker.updatedContentHtml;
    this.terms.splice(index, 1);
    if (this.failTermWriteAfterMutation) {
      this.failTermWriteAfterMutation = false;
      article.contentHtml = previousHtml;
      this.terms = previousTerms;
      return Promise.reject(new Error('simulated term transaction failure'));
    }
    return Promise.resolve();
  }

  transitionArticleStatus(
    input: ArticleStatusTransitionInput,
  ): Promise<ArticleStatusTransitionRecord> {
    const article = this.articles.find(
      (candidate) =>
        candidate.id === input.articleId &&
        candidate.status === input.expectedStatus &&
        (candidate.contentVersion ?? 1) === input.expectedContentVersion &&
        candidate.contentHtml === input.expectedContentHtml &&
        (!input.requireActiveCategory || (candidate.category.isActive ?? true)),
    );
    if (!article || this.failStatusTransition) {
      this.failStatusTransition = false;
      return Promise.reject(new ArticleStatusTransitionConflictError());
    }
    article.status = input.status;
    if (input.publishedAt !== undefined) {
      article.publishedAt = input.publishedAt;
    }
    if (input.archivedAt !== undefined) {
      article.archivedAt = input.archivedAt;
    }
    article.updatedAt = new Date();
    return Promise.resolve({
      id: article.id,
      status: article.status,
      publishedAt: article.publishedAt,
      archivedAt: article.archivedAt ?? null,
    });
  }

  update(
    articleId: string,
    input: UpdateArticleInput,
  ): Promise<AdminArticleRecord> {
    return this.applyUpdate(articleId, input, false);
  }

  updateContent(
    articleId: string,
    _previousContentVersion: number,
    input: UpdateArticleInput & { contentHtml: string },
  ): Promise<AdminArticleRecord> {
    return this.applyUpdate(articleId, input, true);
  }

  findDeleteSafety(
    articleId: string,
  ): Promise<ArticleDeleteSafetyRecord | null> {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) return Promise.resolve(null);
    return Promise.resolve({
      id: article.id,
      status: article.status,
      readingProgressCount: 0,
      savedVocabularyCount: 0,
      quizCount: article.quizzes.length,
      reviewSessionCount: 0,
      reviewAnswerCount: 0,
      ...this.deleteSafety.get(articleId),
    });
  }

  delete(articleId: string): Promise<void> {
    const index = this.articles.findIndex(({ id }) => id === articleId);
    if (index < 0) {
      return Promise.reject(
        Object.assign(new Error('missing'), { code: 'P2025' }),
      );
    }
    this.articles.splice(index, 1);
    return Promise.resolve();
  }

  private toCard(article: ArticleFixture): PublicArticleCardRecord {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      thumbnailUrl: article.thumbnailUrl,
      cefrLevel: article.cefrLevel,
      publishedAt: article.publishedAt,
      category: { ...article.category },
    };
  }

  private readonly toSentence = (
    sentence: SentenceFixture,
  ): ArticleSentenceRecord => {
    const { updatedByUserId, ...record } = sentence;
    void updatedByUserId;
    return { ...record };
  };

  private readonly toTerm = (term: TermFixture): ArticleSentenceTermRecord => {
    const { updatedByUserId, ...record } = term;
    void updatedByUserId;
    return structuredClone(record);
  };

  private toAdminList(article: ArticleFixture): AdminArticleListRecord {
    return {
      ...this.toCard(article),
      categoryId: article.category.id,
      status: article.status,
      contentVersion: article.contentVersion ?? 1,
      archivedAt: article.archivedAt ?? null,
      createdAt: this.createdAt(article),
      updatedAt: article.updatedAt ?? this.createdAt(article),
    };
  }

  private toAdmin(article: ArticleFixture): AdminArticleRecord {
    return {
      id: article.id,
      categoryId: article.category.id,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      contentHtml: article.contentHtml,
      contentVersion: article.contentVersion ?? 1,
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
      authorName: article.authorName,
      thumbnailUrl: article.thumbnailUrl,
      cefrLevel: article.cefrLevel,
      status: article.status,
      publishedAt: article.publishedAt,
      archivedAt: article.archivedAt ?? null,
      createdAt: this.createdAt(article),
      updatedAt: article.updatedAt ?? this.createdAt(article),
      category: { ...article.category },
    };
  }

  private applyUpdate(
    articleId: string,
    input: UpdateArticleInput,
    contentChanged: boolean,
  ): Promise<AdminArticleRecord> {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) {
      return Promise.reject(
        Object.assign(new Error('missing'), { code: 'P2025' }),
      );
    }
    if (
      input.slug &&
      this.articles.some(
        (candidate) =>
          candidate.id !== articleId &&
          candidate.slug.toLowerCase() === input.slug?.toLowerCase(),
      )
    ) {
      return Promise.reject(
        Object.assign(new Error('duplicate'), { code: 'P2002' }),
      );
    }
    if (input.categoryId)
      article.category = this.categoryForId(input.categoryId);
    const previousContentVersion = article.contentVersion ?? 1;
    Object.assign(article, input, {
      updatedAt: new Date(),
      ...(contentChanged ? { contentVersion: previousContentVersion + 1 } : {}),
    });
    if (contentChanged) {
      for (const sentence of this.sentences) {
        if (
          sentence.articleId === articleId &&
          sentence.contentVersion === previousContentVersion
        ) {
          sentence.isActive = false;
        }
      }
    }
    return Promise.resolve(this.toAdmin(article));
  }

  private articleForMarker(
    marker: TermMarkerWriteInput,
  ): ArticleFixture | null {
    return (
      this.articles.find(
        (article) =>
          article.id === marker.articleId &&
          article.status !== 'ARCHIVED' &&
          (article.contentVersion ?? 1) === marker.contentVersion &&
          article.contentHtml === marker.sourceContentHtml,
      ) ?? null
    );
  }

  private termContext(
    articleId: string,
    termId: string,
  ): {
    article: ArticleFixture;
    sentence: SentenceFixture;
    term: TermFixture;
  } | null {
    const article = this.articles.find(({ id }) => id === articleId);
    if (!article) return null;
    const term = this.terms.find(({ id }) => id === termId);
    if (!term) return null;
    const sentence = this.sentences.find(
      (candidate) =>
        candidate.id === term.sentenceId &&
        candidate.articleId === articleId &&
        candidate.contentVersion === (article.contentVersion ?? 1),
    );
    return sentence ? { article, sentence, term } : null;
  }

  private applyTermUpdate(
    term: TermFixture,
    input: UpdateArticleTermInput,
  ): void {
    const { examples, updatedByUserId, ...metadata } = input;
    Object.assign(term, metadata, {
      updatedByUserId,
      updatedAt: new Date(),
    });
    if (examples !== undefined) {
      term.examples = structuredClone(
        examples,
      ) as ArticleSentenceTermRecord['examples'];
    }
  }

  private categoryForId(categoryId: string): ArticleFixture['category'] {
    const known = this.articles.find(
      ({ category }) => category.id === categoryId,
    )?.category;
    return known
      ? { ...known }
      : { id: categoryId, name: 'Technology', slug: 'technology' };
  }

  private createdAt(article: ArticleFixture): Date {
    return (
      article.createdAt ??
      article.publishedAt ??
      new Date('2026-07-01T00:00:00Z')
    );
  }
}
