export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const LEXICAL_UNIT_TYPES = ['WORD', 'PHRASE'] as const;
export const REVIEW_QUESTION_TYPES = [
  'SELECT_MEANING',
  'SELECT_WORD',
  'SELECT_CORRECT_CONTEXT',
  'FILL_BLANK',
] as const;
export const REVIEW_QUESTION_PROMPT_STYLES = [
  'QUICK_MATCH',
  'CONTEXT_CLUE',
  'MINI_CHALLENGE',
  'REAL_WORLD_USE',
] as const;
export const REVIEW_GOALS = [
  'BALANCED',
  'RECALL',
  'SPELLING',
  'CONTEXT',
] as const;
export const REVIEW_SKILL_DIMENSIONS = [
  'RECOGNITION',
  'RECALL',
  'SPELLING',
  'CONTEXT',
  'PRODUCTION',
] as const;
export const AGENTIC_REVIEW_V1_SKILL_DIMENSIONS = [
  'RECOGNITION',
  'RECALL',
  'SPELLING',
  'CONTEXT',
] as const;
export const REVIEW_ERROR_TYPES = [
  'LOW_RECALL',
  'MEANING_CONFUSION',
  'CONFUSABLE_WORD',
  'SPELLING_ERROR',
  'WORD_FORM_ERROR',
  'COLLOCATION_ERROR',
  'CONTEXT_MISUNDERSTANDING',
  'CARELESS_ERROR',
  'UNKNOWN',
] as const;
export const REVIEW_AGENT_ACTIONS = [
  'CONTINUE',
  'REQUEUE_WITH_NEW_TYPE',
  'TEACH_AND_REQUEUE',
  'FLAG_FOR_FUTURE_FOCUS',
] as const;
export const REVIEW_TARGET_DURATIONS = [5, 10, 15] as const;
export const REVIEW_RETEST_AFTER_ITEMS = [2, 3, 4, 5] as const;
export const AI_PROVIDER_NAMES = ['GEMINI', 'GROQ'] as const;

export const REVIEW_SESSION_PLAN_PROMPT_VERSION =
  'review-session-plan-v1' as const;
export const REVIEW_ANSWER_DIAGNOSIS_PROMPT_VERSION =
  'review-answer-diagnosis-v1' as const;
export const REVIEW_QUESTION_PROMPT_VERSION =
  'review-question-generation-v4' as const;
export const REVIEW_QUESTION_BATCH_MAX_SIZE = 4;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type LexicalUnitType = (typeof LEXICAL_UNIT_TYPES)[number];
export type ReviewQuestionType = (typeof REVIEW_QUESTION_TYPES)[number];
export type ReviewQuestionPromptStyle =
  (typeof REVIEW_QUESTION_PROMPT_STYLES)[number];
export type ReviewGoal = (typeof REVIEW_GOALS)[number];
export type ReviewSkillDimension = (typeof REVIEW_SKILL_DIMENSIONS)[number];
export type ReviewErrorType = (typeof REVIEW_ERROR_TYPES)[number];
export type ReviewAgentAction = (typeof REVIEW_AGENT_ACTIONS)[number];
export type ReviewTargetDuration = (typeof REVIEW_TARGET_DURATIONS)[number];
export type ReviewRetestAfterItems = (typeof REVIEW_RETEST_AFTER_ITEMS)[number];
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

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

export interface ReviewQuestionGenerationInput {
  wordOrPhrase: string;
  contextualMeaningVi: string;
  partOfSpeech?: string;
  originalSentence?: string;
  targetCefr: CefrLevel;
  requestedQuestionType: ReviewQuestionType;
  promptStyle: ReviewQuestionPromptStyle;
}

export interface ReviewQuestionGenerationResult {
  prompt: string;
  blankSentence: string | null;
  answerExplanation: string;
  distractors: string[];
}

export type ReviewQuestionBatchGenerationResult =
  ReviewQuestionGenerationResult[];

export interface ReviewAttemptSnapshot {
  questionType: ReviewQuestionType;
  skillDimension: ReviewSkillDimension;
  isCorrect: boolean;
  responseTimeMs: number;
  hintsUsed: number;
}

export interface ReviewSkillAggregate {
  skillDimension: ReviewSkillDimension;
  attempts: number;
  correct: number;
  averageResponseTimeMs: number;
}

export interface ReviewSessionPlanCandidate {
  alias: string;
  wordOrPhrase: string;
  lemma: string;
  partOfSpeech: string;
  contextualMeaningVi: string;
  originalSentence: string;
  daysOverdue: number;
  lapseCount: number;
  recentAttempts: ReviewAttemptSnapshot[];
}

export interface PlanReviewSessionInput {
  targetCefr: CefrLevel;
  reviewGoal: ReviewGoal;
  targetDurationMinutes: ReviewTargetDuration;
  maxItemCount: number;
  allowedFocusDimensions: ReviewSkillDimension[];
  candidates: ReviewSessionPlanCandidate[];
  skillAggregates: ReviewSkillAggregate[];
}

export interface ReviewSessionPlanResult {
  reviewGoal: ReviewGoal;
  focusDimensions: ReviewSkillDimension[];
  orderedCandidateAliases: string[];
  summary: string;
  confidence: number;
}

export interface DiagnoseReviewAnswerInput {
  targetCefr: CefrLevel;
  wordOrPhrase: string;
  lemma: string;
  partOfSpeech: string;
  contextualMeaningVi: string;
  originalSentence: string;
  questionType: ReviewQuestionType;
  learnerAnswer: string;
  correctAnswer: string;
  responseTimeMs: number;
  hintsUsed: number;
  attemptNumber: number;
  recentAttempts: ReviewAttemptSnapshot[];
  skillAggregates: ReviewSkillAggregate[];
  allowedSkillDimensions: ReviewSkillDimension[];
  allowedActions: ReviewAgentAction[];
  allowedRetestQuestionTypes: ReviewQuestionType[];
  allowedRetestAfterItems: ReviewRetestAfterItems[];
}

export interface ReviewMicroLesson {
  title: string;
  explanation: string;
  example: string;
}

export interface ReviewRetestDecision {
  questionType: ReviewQuestionType;
  afterItems: ReviewRetestAfterItems;
}

export interface ReviewAnswerDiagnosisResult {
  action: ReviewAgentAction;
  skillDimension: ReviewSkillDimension;
  errorType: ReviewErrorType;
  confidence: number;
  reasonCode: string;
  microLesson: ReviewMicroLesson | null;
  retest: ReviewRetestDecision | null;
}

export interface AiOperationMetadata {
  provider: AiProviderName;
  model: string;
  promptVersion: string;
}

export interface AiOperationResult<T> {
  result: T;
  metadata: AiOperationMetadata;
}
