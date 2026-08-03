import { Test, type TestingModule } from '@nestjs/testing';
import type { AiConfig } from '../../config/ai.config';
import { AI_CONFIG } from '../../config/config.module';
import type {
  ArticleAnalysisInput,
  ArticleAnalysisResult,
  ReviewQuestionGenerationInput,
  ReviewQuestionGenerationResult,
  TermEnrichmentInput,
  TermEnrichmentResult,
} from './ai.contracts';
import { ProviderCallError } from './ai.errors';
import {
  type AiProvider,
  GEMINI_AI_PROVIDER,
  GROQ_AI_PROVIDER,
} from './ai.provider';
import { AiService } from './ai.service';

const config: AiConfig = {
  geminiApiKey: 'gemini-test-key',
  geminiModel: 'gemini-test-model',
  groqApiKey: 'groq-test-key',
  groqModel: 'groq-test-model',
  requestTimeoutMs: 5000,
  maxArticleCharacters: 50000,
  maxTermsPerArticle: 25,
};

const articleInput: ArticleAnalysisInput = {
  articleId: 'article-1',
  title: 'City expands its public transport network',
  articleText:
    'The city expanded the network. Commuters welcomed the ambitious plan.',
  contentVersion: 3,
  sentences: [
    {
      sentenceId: 'sentence-1',
      sentenceText: 'The city expanded the network.',
    },
    {
      sentenceId: 'sentence-2',
      sentenceText: 'Commuters welcomed the ambitious plan.',
    },
  ],
  allowedCategories: [
    { id: 'category-1', slug: 'society', name: 'Society' },
    { id: 'category-2', slug: 'business', name: 'Business' },
  ],
  maxTermCount: 5,
};

const articleResult: ArticleAnalysisResult = {
  summaryEn: 'A city expanded public transport under an ambitious plan.',
  cefrLevel: 'B1',
  categorySlug: 'society',
  terms: [
    {
      sentenceId: 'sentence-2',
      value: 'ambitious',
      wordDisplay: 'ambitious',
      lemma: 'ambitious',
      normalizedLemma: 'ambitious',
      unitType: 'WORD',
      partOfSpeech: 'adjective',
      cefrLevel: 'B1',
      selectionReason: 'A useful adjective for describing challenging plans.',
    },
  ],
};

const enrichmentInput: TermEnrichmentInput = {
  articleId: 'article-1',
  articleTitle: articleInput.title,
  termId: 'term-1',
  value: 'ambitious',
  lemma: 'ambitious',
  unitType: 'WORD',
  parentSentenceText: 'Commuters welcomed the ambitious plan.',
  surroundingSentenceContext:
    'The city expanded the network. Commuters welcomed the ambitious plan.',
};

const enrichmentResult: TermEnrichmentResult = {
  wordDisplay: 'ambitious',
  normalizedLemma: 'ambitious',
  partOfSpeech: 'adjective',
  cefrLevel: 'B1',
  contextualMeaningVi: 'đầy tham vọng',
  definitionEn: 'Intended to achieve something difficult or significant.',
  contextualExplanation:
    'It describes a plan with large and challenging goals.',
  ipa: '/æmˈbɪʃ.əs/',
  synonyms: ['aspiring', 'bold'],
  antonyms: ['unambitious'],
  collocations: ['ambitious plan'],
  relatedTerms: ['ambition'],
  vocabularyTopic: 'Goals and planning',
  examples: [
    {
      sentence: 'They announced an ambitious housing project.',
      translationVi: 'Họ công bố một dự án nhà ở đầy tham vọng.',
    },
  ],
  sentenceTranslationVi:
    'Những người đi làm hoan nghênh kế hoạch đầy tham vọng.',
};

const reviewQuestionInput: ReviewQuestionGenerationInput = {
  wordOrPhrase: 'engaging',
  lemma: 'engage',
  partOfSpeech: 'adjective',
  contextualMeaningVi: 'hap dan',
  originalSentence: 'The lesson was engaging for everyone.',
  articleTopic: 'Education',
  targetCefr: 'B1',
  requestedQuestionType: 'SELECT_MEANING',
};

const reviewQuestionResult: ReviewQuestionGenerationResult = {
  prompt: 'What does "engaging" mean in this sentence?',
  blankSentence: null,
  correctAnswerText: null,
  answerExplanation:
    'The word describes something that keeps your interest. It is positive in this lesson context.',
  options: [
    { optionText: 'hap dan', isCorrect: true },
    { optionText: 'kho hieu', isCorrect: false },
    { optionText: 'ngan gon', isCorrect: false },
  ],
};

describe('AiService', () => {
  let service: AiService;
  let gemini: jest.Mocked<AiProvider>;
  let groq: jest.Mocked<AiProvider>;

  beforeEach(async () => {
    gemini = {
      generateStructured: jest.fn(),
    };
    groq = {
      generateStructured: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: AI_CONFIG, useValue: config },
        { provide: GEMINI_AI_PROVIDER, useValue: gemini },
        { provide: GROQ_AI_PROVIDER, useValue: groq },
      ],
    }).compile();

    service = module.get(AiService);
  });

  it('returns valid Gemini article analysis without calling Groq', async () => {
    gemini.generateStructured.mockResolvedValue(JSON.stringify(articleResult));

    await expect(service.analyzeArticle(articleInput)).resolves.toEqual(
      articleResult,
    );
    expect(gemini.generateStructured.mock.calls).toHaveLength(1);
    expect(groq.generateStructured.mock.calls).toHaveLength(0);

    const request = gemini.generateStructured.mock.calls[0][0];
    expect(request.userContent).toBe(
      JSON.stringify({
        articleId: articleInput.articleId,
        title: articleInput.title,
        contentVersion: articleInput.contentVersion,
        sentences: articleInput.sentences,
        allowedCategories: articleInput.allowedCategories.map(
          ({ slug, name }) => ({ slug, name }),
        ),
        maxTermCount: articleInput.maxTermCount,
      }),
    );
    expect(request.systemInstruction).toContain('Do not generate meanings');
    expect(request.systemInstruction).toContain('character-for-character');
    expect(JSON.stringify(request.schema)).not.toContain('definitionEn');
    expect(request.maxOutputTokens).toBe(3072);
  });

  it('generates a validated review question from only the allowed context fields', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify(reviewQuestionResult),
    );

    await expect(
      service.generateReviewQuestion(reviewQuestionInput),
    ).resolves.toEqual(reviewQuestionResult);
    expect(groq.generateStructured.mock.calls).toHaveLength(0);

    const request = gemini.generateStructured.mock.calls[0][0];
    expect(request.userContent).toBe(JSON.stringify(reviewQuestionInput));
    expect(request.userContent).not.toContain('userId');
    expect(request.userContent).not.toContain('learningHistory');
    expect(request.systemInstruction).toContain('two or three short sentences');
    expect(request.systemInstruction).toContain('target CEFR');
    expect(request.systemInstruction).toContain(
      'copy contextualMeaningVi character-for-character',
    );
    expect(JSON.stringify(request.schema)).toContain(
      'exactly copy contextualMeaningVi',
    );
  });

  it('rejects ambiguous or malformed review output from both providers', async () => {
    const invalid = {
      ...reviewQuestionResult,
      options: reviewQuestionResult.options.map((option) => ({
        ...option,
        isCorrect: true,
      })),
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

    await expect(
      service.generateReviewQuestion(reviewQuestionInput),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('restores the authoritative answer when a provider paraphrases or mangles it', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...reviewQuestionResult,
        options: reviewQuestionResult.options.map((option) =>
          option.isCorrect
            ? { ...option, optionText: 'interesting and engaging' }
            : option,
        ),
      }),
    );

    await expect(
      service.generateReviewQuestion(reviewQuestionInput),
    ).resolves.toEqual(reviewQuestionResult);
    expect(groq.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the limited provider fallback when review generation times out', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('timeout'),
    );
    groq.generateStructured.mockResolvedValue(
      JSON.stringify(reviewQuestionResult),
    );

    await expect(
      service.generateReviewQuestion(reviewQuestionInput),
    ).resolves.toEqual(reviewQuestionResult);
    expect(gemini.generateStructured.mock.calls).toHaveLength(1);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('uses Groq once after a retryable Gemini failure', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('rate-limit'),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(articleResult));

    await expect(service.analyzeArticle(articleInput)).resolves.toEqual(
      articleResult,
    );
    expect(gemini.generateStructured.mock.calls).toHaveLength(1);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
    expect(gemini.generateStructured.mock.invocationCallOrder[0]).toBeLessThan(
      groq.generateStructured.mock.invocationCallOrder[0],
    );
  });

  it('uses Groq after Gemini rejects a provider-specific request shape', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('request'),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(articleResult));

    await expect(service.analyzeArticle(articleInput)).resolves.toEqual(
      articleResult,
    );
    expect(gemini.generateStructured.mock.calls).toHaveLength(1);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('does not call Groq for a Gemini configuration or authentication failure', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('configuration'),
    );

    await expect(service.analyzeArticle(articleInput)).rejects.toMatchObject({
      code: 'CONFIGURATION_FAILURE',
      message: 'AI service configuration is invalid',
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it('uses Groq once after unusable structured Gemini output', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({ ...articleResult, unexpected: true }),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(articleResult));

    await expect(service.analyzeArticle(articleInput)).resolves.toEqual(
      articleResult,
    );
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('orders candidates by sentence and restores a unique exact-case surface from the source sentence', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...articleResult,
        terms: [
          {
            ...articleResult.terms[0],
            value: 'Ambitious',
          },
          {
            ...articleResult.terms[0],
            sentenceId: 'sentence-1',
            value: 'network',
            wordDisplay: 'network',
            lemma: 'network',
            normalizedLemma: 'network',
            partOfSpeech: 'noun',
            selectionReason: 'A useful noun for connected systems.',
          },
        ],
      }),
    );

    await expect(service.analyzeArticle(articleInput)).resolves.toMatchObject({
      terms: [
        { sentenceId: 'sentence-1', value: 'network' },
        { sentenceId: 'sentence-2', value: 'ambitious' },
      ],
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it('drops an ungrounded candidate while preserving validated candidates', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...articleResult,
        terms: [
          articleResult.terms[0],
          {
            ...articleResult.terms[0],
            value: 'invented surface',
            wordDisplay: 'invented surface',
            lemma: 'invent',
            normalizedLemma: 'invent',
          },
        ],
      }),
    );

    await expect(service.analyzeArticle(articleInput)).resolves.toMatchObject({
      terms: [articleResult.terms[0]],
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it('exposes a provider-neutral error when both providers fail', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('server'),
    );
    groq.generateStructured.mockRejectedValue(new ProviderCallError('network'));

    await expect(service.analyzeArticle(articleInput)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'AI service is temporarily unavailable',
    });
    expect(gemini.generateStructured.mock.calls).toHaveLength(1);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('falls back after the configured Gemini request times out', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('timeout'),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(enrichmentResult));

    await expect(
      service.enrichContextualTerm(enrichmentInput),
    ).resolves.toEqual(enrichmentResult);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('rejects invalid local input before either provider is called', async () => {
    const invalidInput = {
      ...articleInput,
      maxTermCount: config.maxTermsPerArticle + 1,
    };

    await expect(service.analyzeArticle(invalidInput)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(gemini.generateStructured.mock.calls).toHaveLength(0);
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it.each([
    ['an unknown CEFR level', { ...articleResult, cefrLevel: 'B3' }],
    [
      'an unknown unit type',
      {
        ...articleResult,
        terms: [{ ...articleResult.terms[0], unitType: 'IDIOM' }],
      },
    ],
    [
      'a category outside the supplied allowlist',
      { ...articleResult, categorySlug: 'technology' },
    ],
  ])('rejects %s from both providers', async (_case, invalidResult) => {
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));

    await expect(service.analyzeArticle(articleInput)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('deduplicates repeated grounded candidates without another provider call', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...articleResult,
        terms: [articleResult.terms[0], articleResult.terms[0]],
      }),
    );

    await expect(service.analyzeArticle(articleInput)).resolves.toMatchObject({
      terms: [articleResult.terms[0]],
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it('returns an empty candidate set when every structurally valid candidate is ungrounded', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...articleResult,
        terms: [
          {
            ...articleResult.terms[0],
            value: 'invented surface',
          },
        ],
      }),
    );

    await expect(service.analyzeArticle(articleInput)).resolves.toMatchObject({
      terms: [],
    });
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });

  it('enforces output array bounds and accepts the canonical example shape', async () => {
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify({
        ...enrichmentResult,
        synonyms: Array.from({ length: 9 }, (_, index) => `synonym-${index}`),
      }),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(enrichmentResult));

    const result = await service.enrichContextualTerm(enrichmentInput);

    expect(result).toEqual(enrichmentResult);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
    expect(result.examples[0]).toEqual({
      sentence: enrichmentResult.examples[0].sentence,
      translationVi: enrichmentResult.examples[0].translationVi,
    });
  });

  it('rejects non-canonical example fields', async () => {
    const invalidResult = {
      ...enrichmentResult,
      examples: [
        {
          sentence: enrichmentResult.examples[0].sentence,
          translationVi: enrichmentResult.examples[0].translationVi,
          translation: 'unexpected',
        },
      ],
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));

    await expect(
      service.enrichContextualTerm(enrichmentInput),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it.each([
    [
      'duplicate list values',
      { ...enrichmentResult, synonyms: ['Bold', ' bold '] },
    ],
    [
      'duplicate example sentences',
      {
        ...enrichmentResult,
        examples: [
          enrichmentResult.examples[0],
          {
            ...enrichmentResult.examples[0],
            sentence: ` ${enrichmentResult.examples[0].sentence.toUpperCase()} `,
          },
        ],
      },
    ],
  ])('rejects %s from both providers', async (_case, invalidResult) => {
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalidResult));

    await expect(
      service.enrichContextualTerm(enrichmentInput),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });
});
