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

  it('rejects unusable output from both providers when contextualMeaningVi exceeds limit', async () => {
    const invalid = {
      ...result,
      contextualMeaningVi: 'một kế hoạch phát triển rất đầy tham vọng',
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

    await expect(service.enrichContextualTerm(input)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects output when contextualMeaningVi contains a comma', async () => {
    const invalid = {
      ...result,
      contextualMeaningVi: 'tham vọng, táo bạo',
    };
    gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
    groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

    await expect(service.enrichContextualTerm(input)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('accepts contextualMeaningVi with up to 6 words without commas', async () => {
    const validWith6Words = {
      ...result,
      contextualMeaningVi: 'kế hoạch mang đầy tham vọng',
    };
    gemini.generateStructured.mockResolvedValue(
      JSON.stringify(validWith6Words),
    );

    await expect(service.enrichContextualTerm(input)).resolves.toEqual(
      validWith6Words,
    );
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

  describe('generateTutorActivity', () => {
    const tutorInput = {
      allowlistIds: ['vocab-1', 'vocab-2'],
      questionType: 'MULTIPLE_CHOICE' as const,
      candidates: [
        {
          id: 'vocab-1',
          wordDisplay: 'ambitious',
          lemma: 'ambitious',
          partOfSpeech: 'adjective',
          meaningVi: 'đầy tham vọng',
          examples: [],
        },
      ],
    };

    const mcResult = {
      selectedCandidateId: 'vocab-1',
      questionType: 'MULTIPLE_CHOICE',
      questionPromptVi: 'Chọn từ tiếng Anh phù hợp:',
      explanationVi: '"Ambitious" có nghĩa là đầy tham vọng.',
      feedbackCorrectVi: 'Chính xác!',
      feedbackIncorrectVi: 'Chưa đúng.',
      options: [
        { id: 'A', text: 'ambitious' },
        { id: 'B', text: 'lazy' },
        { id: 'C', text: 'tired' },
        { id: 'D', text: 'quiet' },
      ],
      correctOptionId: 'A',
      sentenceWithBlank: null,
      recallPromptVi: null,
      microLessonTitle: null,
      microLessonFactEn: null,
      microLessonFactVi: null,
      microLessonVi: null,
      retestType: null,
      canonicalAnswer: null,
    };

    it('generates multiple choice activity from Gemini', async () => {
      gemini.generateStructured.mockResolvedValue(JSON.stringify(mcResult));

      const result = await service.generateTutorActivity(tutorInput);
      expect(result).toMatchObject({
        selectedCandidateId: 'vocab-1',
        questionType: 'MULTIPLE_CHOICE',
        correctOptionId: 'A',
      });
      expect(groq.generateStructured.mock.calls).toHaveLength(0);
      expect(gemini.generateStructured.mock.calls).toContainEqual([
        expect.objectContaining({
          schemaName: 'tutor_question',
          userContent: JSON.stringify(tutorInput),
        }),
      ]);
    });

    it('falls back to Groq when Gemini fails', async () => {
      gemini.generateStructured.mockRejectedValue(
        new ProviderCallError('rate-limit'),
      );
      groq.generateStructured.mockResolvedValue(JSON.stringify(mcResult));

      const result = await service.generateTutorActivity(tutorInput);
      expect(result).toMatchObject({
        selectedCandidateId: 'vocab-1',
        questionType: 'MULTIPLE_CHOICE',
      });
      expect(groq.generateStructured.mock.calls).toHaveLength(1);
    });

    it('rejects when candidateId is not in allowlist', async () => {
      const invalid = {
        ...mcResult,
        selectedCandidateId: 'vocab-999',
      };
      gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
      groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

      await expect(
        service.generateTutorActivity(tutorInput),
      ).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
      });
    });

    it('rejects when output questionType mismatches input', async () => {
      const invalid = {
        ...mcResult,
        questionType: 'CONTEXTUAL_CLOZE',
        sentenceWithBlank: 'A ___ plan.',
        canonicalAnswer: 'ambitious',
      };
      gemini.generateStructured.mockResolvedValue(JSON.stringify(invalid));
      groq.generateStructured.mockResolvedValue(JSON.stringify(invalid));

      await expect(
        service.generateTutorActivity(tutorInput),
      ).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
      });
    });

    it('rejects invalid input before calling any provider', async () => {
      await expect(
        service.generateTutorActivity({
          allowlistIds: [],
          questionType: 'MULTIPLE_CHOICE',
          candidates: [],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      expect(gemini.generateStructured.mock.calls).toHaveLength(0);
      expect(groq.generateStructured.mock.calls).toHaveLength(0);
    });
  });
});
