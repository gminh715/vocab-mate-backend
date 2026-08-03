export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const LEXICAL_UNIT_TYPES = ['WORD', 'PHRASE'] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type LexicalUnitType = (typeof LEXICAL_UNIT_TYPES)[number];

export interface ArticleAnalysisSentence {
  sentenceId: string;
  sentenceText: string;
}

export interface AllowedArticleCategory {
  id: string;
  slug: string;
  name: string;
}

export interface ArticleAnalysisInput {
  articleId: string;
  title: string;
  articleText: string;
  contentVersion: number;
  sentences: ArticleAnalysisSentence[];
  allowedCategories: AllowedArticleCategory[];
  maxTermCount: number;
}

export interface ArticleAnalysisTerm {
  sentenceId: string;
  value: string;
  wordDisplay: string;
  lemma: string;
  normalizedLemma: string;
  unitType: LexicalUnitType;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  selectionReason: string;
}

export interface ArticleAnalysisResult {
  summaryEn: string;
  cefrLevel: CefrLevel;
  categorySlug: string;
  terms: ArticleAnalysisTerm[];
}

export interface TermEnrichmentInput {
  articleId: string;
  articleTitle: string;
  termId: string;
  value: string;
  lemma: string;
  unitType: LexicalUnitType;
  parentSentenceText: string;
  surroundingSentenceContext: string;
}

export interface TermExample {
  sentence: string;
  translationVi: string;
}

export interface TermEnrichmentResult {
  wordDisplay: string;
  normalizedLemma: string;
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
  vocabularyTopic: string | null;
  examples: TermExample[];
  sentenceTranslationVi: string;
}
