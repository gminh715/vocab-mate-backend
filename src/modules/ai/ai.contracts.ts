export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const AI_PROVIDER_NAMES = ['GEMINI', 'GROQ'] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export interface TermEnrichmentInput {
  articleId: string;
  articleTitle: string;
  termId: string;
  value: string;
  lemma: string;
  parentSentenceText: string;
  surroundingSentenceContext: string;
}

export interface TermExample {
  sentence: string;
  translationVi: string;
}

export interface TermEnrichmentResult {
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  contextualMeaningVi: string;
  definitionEn: string;
  contextualExplanation: string;
  ipa: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  examples: TermExample[];
  sentenceTranslationVi: string;
}
