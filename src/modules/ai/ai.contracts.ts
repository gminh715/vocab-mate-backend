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

export const TUTOR_QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'CONTEXTUAL_CLOZE',
  'TYPED_RECALL',
  'MICRO_LESSON_RETEST',
] as const;

export type TutorQuestionType = (typeof TUTOR_QUESTION_TYPES)[number];

export const OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const RETEST_TYPES = ['CONTEXTUAL_CLOZE', 'TYPED_RECALL'] as const;
export type RetestType = (typeof RETEST_TYPES)[number];

export interface TutorQuestionCandidate {
  id: string;
  wordDisplay: string;
  lemma: string;
  partOfSpeech: string;
  meaningVi: string;
  examples: unknown;
}

export interface TutorQuestionInput {
  allowlistIds: string[];
  candidates: TutorQuestionCandidate[];
  questionType: TutorQuestionType;
}

export interface McOption {
  id: OptionId;
  text: string;
}

export interface BaseTutorQuestionResult {
  selectedCandidateId: string;
  questionType: TutorQuestionType;
  questionPromptVi: string;
  explanationVi: string;
  feedbackCorrectVi: string;
  feedbackIncorrectVi: string;
}

export interface MultipleChoiceResult extends BaseTutorQuestionResult {
  questionType: 'MULTIPLE_CHOICE';
  options: [McOption, McOption, McOption, McOption];
  correctOptionId: OptionId;
}

export interface ContextualClozeResult extends BaseTutorQuestionResult {
  questionType: 'CONTEXTUAL_CLOZE';
  sentenceWithBlank: string;
  canonicalAnswer: string;
}

export interface TypedRecallResult extends BaseTutorQuestionResult {
  questionType: 'TYPED_RECALL';
  recallPromptVi: string;
  canonicalAnswer: string;
}

export interface MicroLessonRetestResult extends BaseTutorQuestionResult {
  questionType: 'MICRO_LESSON_RETEST';
  microLessonVi: string;
  retestType: RetestType;
  sentenceWithBlank?: string;
  recallPromptVi?: string;
  canonicalAnswer: string;
}

export type TutorQuestionResult =
  | MultipleChoiceResult
  | ContextualClozeResult
  | TypedRecallResult
  | MicroLessonRetestResult;
