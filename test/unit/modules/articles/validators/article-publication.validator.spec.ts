import {
  AiGenerationStatus,
  ArticleStatus,
  CefrLevel,
  TermOrigin,
  TermReviewStatus,
} from '../../../../../generated/prisma/enums';
import type { ArticlePublicationSnapshot } from '../../../../../src/modules/articles/repositories/articles.repository';
import { ArticlePublicationValidator } from '../../../../../src/modules/articles/validators/article-publication.validator';

const articleId = '11111111-1111-4111-8111-111111111111';
const sentenceId = '22222222-2222-4222-8222-222222222222';
const termId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-07-23T00:00:00Z');

const createSnapshot = (): ArticlePublicationSnapshot => ({
  article: {
    id: articleId,
    categoryId: '44444444-4444-4444-8444-444444444444',
    title: 'Digital learning',
    slug: 'digital-learning',
    summary: 'A summary.',
    contentHtml: `<p><span data-sentence-id="${sentenceId}">Digital <span data-term-id="${termId}">tools</span> improve learning.</span></p>`,
    contentVersion: 3,
    sourceName: null,
    sourceUrl: null,
    authorName: null,
    thumbnailUrl: null,
    cefrLevel: CefrLevel.B1,
    status: ArticleStatus.DRAFT,
    publishedAt: null,
    archivedAt: null,
    category: {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Technology',
      slug: 'technology',
      isActive: true,
    },
  },
  sentences: [
    {
      id: sentenceId,
      articleId,
      contentVersion: 3,
      sentenceOrder: 1,
      sentenceText: 'Digital tools improve learning.',
      translationVi: 'Công cụ số cải thiện việc học.',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      terms: [
        {
          id: termId,
          sentenceId,
          value: 'tools',
          lemma: 'tool',
          partOfSpeech: 'noun',
          ipa: null,
          cefrLevel: CefrLevel.B1,
          contextualMeaningVi: 'công cụ',
          definitionEn: 'an object used to perform a task',
          contextualExplanation: null,
          synonyms: [],
          antonyms: [],
          collocations: [],
          relatedTerms: [],
          examples: [],
          origin: TermOrigin.MANUAL,
          reviewStatus: TermReviewStatus.APPROVED,
          explanationStatus: AiGenerationStatus.READY,
          explanationError: null,
          isLookupEnabled: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  ],
});

describe('ArticlePublicationValidator', () => {
  const validator = new ArticlePublicationValidator();

  it('accepts a complete valid snapshot', () => {
    expect(validator.validate(createSnapshot())).toEqual([]);
  });

  it('accepts equivalent entity and void-tag serialization but rejects unsafe markup', () => {
    const equivalent = createSnapshot();
    equivalent.article.contentHtml = equivalent.article.contentHtml.replace(
      'Digital ',
      '<br>Digital &#x201c;',
    );
    equivalent.article.contentHtml = equivalent.article.contentHtml.replace(
      ' improve',
      '&#x201d; improve',
    );

    expect(
      validator.validate(equivalent).map(({ code }) => code),
    ).not.toContain('UNSANITIZED_CONTENT_HTML');

    const unsafe = createSnapshot();
    unsafe.article.contentHtml = unsafe.article.contentHtml.replace(
      '<p>',
      '<p onclick="bad()">',
    );
    expect(validator.validate(unsafe)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNSANITIZED_CONTENT_HTML' }),
      ]),
    );
  });

  it('returns checklist issues for an unparsed draft', () => {
    const snapshot = createSnapshot();
    snapshot.sentences = [];
    snapshot.article.contentHtml = '<p>Unparsed draft.</p>';

    expect(validator.validate(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_PARSE' }),
        expect.objectContaining({ code: 'MINIMUM_TERMS_NOT_MET' }),
      ]),
    );
  });

  it.each([
    {
      name: 'incomplete article metadata',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.title = ' ';
      },
      code: 'ARTICLE_METADATA_INCOMPLETE',
    },
    {
      name: 'inactive category',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.category.isActive = false;
      },
      code: 'INACTIVE_CATEGORY',
    },
    {
      name: 'orphan sentence marker',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.contentHtml = snapshot.article.contentHtml.replace(
          sentenceId,
          '55555555-5555-4555-8555-555555555555',
        );
      },
      code: 'ORPHAN_SENTENCE_MARKER',
    },
    {
      name: 'orphan term marker',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.article.contentHtml = snapshot.article.contentHtml.replace(
          termId,
          '66666666-6666-4666-8666-666666666666',
        );
      },
      code: 'ORPHAN_TERM_MARKER',
    },
    {
      name: 'inactive sentence marker',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].isActive = false;
      },
      code: 'INACTIVE_SENTENCE_MARKER',
    },
    {
      name: 'incomplete term metadata',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].lemma = ' ';
      },
      code: 'TERM_METADATA_INCOMPLETE',
    },
    {
      name: 'missing contextual meaning',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].contextualMeaningVi = null;
      },
      code: 'TERM_SNAPSHOT_INCOMPLETE',
    },
  ])('reports $name', ({ mutate, code }) => {
    const snapshot = createSnapshot();
    mutate(snapshot);
    expect(validator.validate(snapshot)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('ignores marker-free pending and rejected candidates', () => {
    const snapshot = createSnapshot();
    snapshot.sentences[0].terms.push(
      {
        ...snapshot.sentences[0].terms[0],
        id: '77777777-7777-4777-8777-777777777777',
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.PENDING,
        explanationStatus: AiGenerationStatus.PENDING,
        contextualMeaningVi: null,
        isActive: false,
        isLookupEnabled: false,
      },
      {
        ...snapshot.sentences[0].terms[0],
        id: '88888888-8888-4888-8888-888888888888',
        origin: TermOrigin.AI,
        reviewStatus: TermReviewStatus.REJECTED,
        explanationStatus: AiGenerationStatus.FAILED,
        contextualMeaningVi: null,
        isActive: false,
        isLookupEnabled: false,
      },
    );

    expect(validator.validate(snapshot)).toEqual([]);
  });

  it.each([AiGenerationStatus.PENDING, AiGenerationStatus.FAILED])(
    'allows an approved lazy NLP term with %s enrichment and deferred metadata',
    (explanationStatus) => {
      const snapshot = createSnapshot();
      const term = snapshot.sentences[0].terms[0];
      term.origin = TermOrigin.NLP;
      term.explanationStatus = explanationStatus;
      term.partOfSpeech = null;
      term.cefrLevel = null;
      term.contextualMeaningVi = null;
      snapshot.sentences[0].translationVi = null;

      expect(validator.validate(snapshot)).toEqual([]);
    },
  );

  it.each([
    {
      name: 'missing meaning',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].contextualMeaningVi = null;
      },
    },
    {
      name: 'missing English definition',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].definitionEn = ' ';
      },
    },
    {
      name: 'malformed examples',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].examples = [
          { sentence: 'Tools help.', translationVi: '' },
        ];
      },
    },
    {
      name: 'non-canonical examples',
      mutate: (snapshot: ArticlePublicationSnapshot) => {
        snapshot.sentences[0].terms[0].examples = [
          {
            sentence: 'Tools help.',
            translationVi: 'Công cụ giúp ích.',
            extra: true,
          },
        ];
      },
    },
  ])('rejects a READY term with $name', ({ mutate }) => {
    const snapshot = createSnapshot();
    mutate(snapshot);
    expect(validator.validate(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TERM_SNAPSHOT_INCOMPLETE' }),
      ]),
    );
  });

  it('requires exactly one marker for an approved visible term', () => {
    const snapshot = createSnapshot();
    snapshot.article.contentHtml = snapshot.article.contentHtml.replace(
      ' improve learning.',
      ` improve learning with <span data-term-id="${termId}">tools</span>.`,
    );

    expect(validator.validate(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_TERM_MARKER',
          entityId: termId,
        }),
      ]),
    );
  });
});
