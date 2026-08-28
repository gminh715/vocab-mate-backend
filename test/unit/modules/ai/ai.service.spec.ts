import { Test, type TestingModule } from '@nestjs/testing';
import type { AiConfig } from '../../../../src/config/ai.config';
import { AI_CONFIG } from '../../../../src/config/config.module';
import type {
  TermEnrichmentInput,
  TermEnrichmentResult,
} from '../../../../src/modules/ai/ai.contracts';
import { ProviderCallError } from '../../../../src/modules/ai/ai.errors';
import {
  type AiProvider,
  GEMINI_AI_PROVIDER,
  GROQ_AI_PROVIDER,
} from '../../../../src/modules/ai/providers/ai-provider.contract';
import { AiService } from '../../../../src/modules/ai/services/ai.service';

const config: AiConfig = {
  geminiApiKey: 'gemini-test-key',
  geminiModel: 'gemini-test-model',
  groqApiKey: 'groq-test-key',
  groqModel: 'groq-test-model',
  requestTimeoutMs: 5000,
};

const input: TermEnrichmentInput = {
  articleId: 'article-1',
  articleTitle: 'City expands its public transport network',
  termId: 'term-1',
  value: 'ambitious',
  lemma: 'ambitious',
  parentSentenceText: 'Commuters welcomed the ambitious plan.',
  surroundingSentenceContext:
    'The city expanded the network. Commuters welcomed the ambitious plan.',
};

const result: TermEnrichmentResult = {
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
  examples: [
    {
      sentence: 'They announced an ambitious housing project.',
      translationVi: 'Họ công bố một dự án nhà ở đầy tham vọng.',
    },
  ],
  sentenceTranslationVi:
    'Những người đi làm hoan nghênh kế hoạch đầy tham vọng.',
};

describe('AiService', () => {
  let service: AiService;
  let gemini: jest.Mocked<AiProvider>;
  let groq: jest.Mocked<AiProvider>;

  beforeEach(async () => {
    gemini = { generateStructured: jest.fn() };
    groq = { generateStructured: jest.fn() };
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

  it('returns validated contextual enrichment from Gemini', async () => {
    gemini.generateStructured.mockResolvedValue(JSON.stringify(result));

    await expect(service.enrichContextualTerm(input)).resolves.toEqual(result);
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
    expect(gemini.generateStructured.mock.calls).toContainEqual([
      expect.objectContaining({
        schemaName: 'term_enrichment',
        userContent: JSON.stringify(input),
      }),
    ]);
  });

  it('falls back to Groq after an eligible Gemini failure', async () => {
    gemini.generateStructured.mockRejectedValue(
      new ProviderCallError('timeout'),
    );
    groq.generateStructured.mockResolvedValue(JSON.stringify(result));

    await expect(service.enrichContextualTerm(input)).resolves.toEqual(result);
    expect(groq.generateStructured.mock.calls).toHaveLength(1);
  });

  it('rejects unusable output from both providers', async () => {
    const invalid = {
      ...result,
      contextualMeaningVi: 'một kế hoạch rất đầy tham vọng',
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

    await expect(service.enrichContextualTerm(input)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects output with fields outside the lookup contract', async () => {
    const invalid = {
      ...result,
      internalReasoning: 'This must never reach the client.',
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

    await expect(service.enrichContextualTerm(input)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects malformed input before calling a provider', async () => {
    await expect(
      service.enrichContextualTerm({
        ...input,
        parentSentenceText: 'No term here.',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(gemini.generateStructured.mock.calls).toHaveLength(0);
    expect(groq.generateStructured.mock.calls).toHaveLength(0);
  });
});
