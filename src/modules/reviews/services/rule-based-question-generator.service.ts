import { Injectable } from '@nestjs/common';
import {
  QuestionGenerationSource,
  QuestionType,
  type CefrLevel,
} from '../../../../generated/prisma/enums';

const MAX_OPTIONS = 4;
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_]/u;

export interface VocabularyQuestionSnapshot {
  id: string;
  articleSentenceTermId: string;
  savedWordDisplay: string;
  savedLemma: string;
  savedPartOfSpeech: string;
  savedCefrLevel: CefrLevel;
  savedContextSentence: string;
  savedMeaningVi: string;
  savedExplanation: string | null;
  categoryId: string;
  articleTopic?: string;
}

export interface GeneratedQuestionOption {
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
  displayOrder: number;
}

export interface GeneratedQuestionSpec {
  quizId: null;
  articleSentenceTermId: string;
  questionType: QuestionType;
  generationSource: QuestionGenerationSource;
  difficultyCefr: CefrLevel;
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  displayOrder: number;
  isActive: boolean;
  options: GeneratedQuestionOption[];
}

export interface CachedQuestionShape {
  prompt: string;
  blankSentence: string | null;
  correctAnswerText: string | null;
  answerExplanation: string | null;
  isCaseSensitive: boolean;
  points: number;
  options: Array<{
    optionText: string;
    isCorrect: boolean;
    explanation: string | null;
    displayOrder: number;
  }>;
}

@Injectable()
export class RuleBasedQuestionGeneratorService {
  generate(
    vocabulary: VocabularyQuestionSnapshot,
    questionType: QuestionType,
    candidates: VocabularyQuestionSnapshot[],
  ): GeneratedQuestionSpec | null {
    const base = {
      quizId: null,
      articleSentenceTermId: vocabulary.articleSentenceTermId,
      questionType,
      generationSource: QuestionGenerationSource.RULE_BASED,
      difficultyCefr: vocabulary.savedCefrLevel,
      answerExplanation: vocabulary.savedExplanation,
      isCaseSensitive: false,
      points: 1,
      displayOrder: 1,
      isActive: true,
    } as const;

    if (questionType === QuestionType.FILL_BLANK) {
      const blankSentence = this.blankExactOccurrence(
        vocabulary.savedContextSentence,
        vocabulary.savedWordDisplay,
      );
      if (!blankSentence) return null;
      return {
        ...base,
        prompt: 'Complete the original sentence with the saved vocabulary.',
        blankSentence,
        correctAnswerText: vocabulary.savedWordDisplay,
        options: [],
      };
    }

    const optionContent = this.optionContent(vocabulary, questionType);
    if (!optionContent) return null;
    const distractors = this.compatibleCandidates(vocabulary, candidates)
      .map((candidate) => this.optionContent(candidate, questionType)?.answer)
      .filter((answer): answer is string => answer !== undefined)
      .filter(
        (answer, index, answers) =>
          this.normalize(answer) !== this.normalize(optionContent.answer) &&
          answers.findIndex(
            (candidate) => this.normalize(candidate) === this.normalize(answer),
          ) === index,
      )
      .slice(0, MAX_OPTIONS - 1);
    if (distractors.length === 0) return null;

    return {
      ...base,
      prompt: optionContent.prompt,
      blankSentence: null,
      correctAnswerText: null,
      options: this.orderOptions(
        vocabulary.id,
        questionType,
        optionContent.answer,
        distractors,
      ),
    };
  }

  matchesCache(
    cached: CachedQuestionShape,
    generated: GeneratedQuestionSpec,
  ): boolean {
    return (
      cached.prompt === generated.prompt &&
      cached.blankSentence === generated.blankSentence &&
      cached.correctAnswerText === generated.correctAnswerText &&
      cached.answerExplanation === generated.answerExplanation &&
      cached.isCaseSensitive === generated.isCaseSensitive &&
      cached.points === generated.points &&
      cached.options.length === generated.options.length &&
      cached.options.every((option, index) => {
        const expected = generated.options[index];
        return (
          expected !== undefined &&
          option.optionText === expected?.optionText &&
          option.isCorrect === expected.isCorrect &&
          option.explanation === expected.explanation &&
          option.displayOrder === expected.displayOrder
        );
      })
    );
  }

  canReuseCache(
    cached: CachedQuestionShape,
    vocabulary: VocabularyQuestionSnapshot,
    questionType: QuestionType,
    candidates: VocabularyQuestionSnapshot[],
  ): boolean {
    const generated = this.generate(vocabulary, questionType, candidates);
    if (!generated) return false;
    if (questionType === QuestionType.FILL_BLANK) {
      return this.matchesCache(cached, generated);
    }
    if (
      cached.prompt !== generated.prompt ||
      cached.blankSentence !== null ||
      cached.correctAnswerText !== null ||
      cached.answerExplanation !== generated.answerExplanation ||
      cached.isCaseSensitive !== generated.isCaseSensitive ||
      cached.points !== generated.points ||
      cached.options.length < 2 ||
      cached.options.length > MAX_OPTIONS
    ) {
      return false;
    }
    const expected = this.optionContent(vocabulary, questionType);
    if (!expected) return false;
    const normalizedOptions = cached.options.map(({ optionText }) =>
      this.normalize(optionText),
    );
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      return false;
    }
    const correct = cached.options.filter(({ isCorrect }) => isCorrect);
    if (
      correct.length !== 1 ||
      this.normalize(correct[0]?.optionText ?? '') !==
        this.normalize(expected.answer)
    ) {
      return false;
    }
    const validDistractors = new Set(
      this.compatibleCandidates(vocabulary, candidates)
        .map((candidate) => this.optionContent(candidate, questionType)?.answer)
        .filter((answer): answer is string => answer !== undefined)
        .map((answer) => this.normalize(answer)),
    );
    return cached.options
      .filter(({ isCorrect }) => !isCorrect)
      .every(({ optionText }) =>
        validDistractors.has(this.normalize(optionText)),
      );
  }

  private optionContent(
    vocabulary: VocabularyQuestionSnapshot,
    questionType: QuestionType,
  ): { prompt: string; answer: string } | null {
    if (questionType === QuestionType.SELECT_MEANING) {
      return {
        prompt: `Choose the saved contextual meaning of "${vocabulary.savedWordDisplay}".`,
        answer: vocabulary.savedMeaningVi,
      };
    }
    if (questionType === QuestionType.SELECT_WORD) {
      return {
        prompt: `Choose the saved word for this meaning: ${vocabulary.savedMeaningVi}`,
        answer: vocabulary.savedWordDisplay,
      };
    }
    if (questionType === QuestionType.SELECT_CORRECT_CONTEXT) {
      return {
        prompt: `Choose the original saved context for "${vocabulary.savedWordDisplay}".`,
        answer: vocabulary.savedContextSentence,
      };
    }
    return null;
  }

  private compatibleCandidates(
    vocabulary: VocabularyQuestionSnapshot,
    candidates: VocabularyQuestionSnapshot[],
  ): VocabularyQuestionSnapshot[] {
    const targetPartOfSpeech = this.normalize(vocabulary.savedPartOfSpeech);
    const targetLemma = this.normalize(vocabulary.savedLemma);
    return candidates
      .filter(
        (candidate) =>
          candidate.id !== vocabulary.id &&
          candidate.articleSentenceTermId !==
            vocabulary.articleSentenceTermId &&
          this.normalize(candidate.savedLemma) !== targetLemma &&
          (candidate.savedCefrLevel === vocabulary.savedCefrLevel ||
            candidate.categoryId === vocabulary.categoryId),
      )
      .sort((left, right) => {
        const leftPartOfSpeech =
          this.normalize(left.savedPartOfSpeech) === targetPartOfSpeech ? 0 : 1;
        const rightPartOfSpeech =
          this.normalize(right.savedPartOfSpeech) === targetPartOfSpeech
            ? 0
            : 1;
        return (
          leftPartOfSpeech - rightPartOfSpeech ||
          Number(right.savedCefrLevel === vocabulary.savedCefrLevel) -
            Number(left.savedCefrLevel === vocabulary.savedCefrLevel) ||
          left.id.localeCompare(right.id)
        );
      });
  }

  private orderOptions(
    vocabularyId: string,
    questionType: QuestionType,
    correctAnswer: string,
    distractors: string[],
  ): GeneratedQuestionOption[] {
    const values = distractors.map((optionText) => ({
      optionText,
      isCorrect: false,
      explanation: null,
    }));
    const correctIndex =
      this.stableHash(`${vocabularyId}:${questionType}`) % (values.length + 1);
    values.splice(correctIndex, 0, {
      optionText: correctAnswer,
      isCorrect: true,
      explanation: null,
    });
    return values.map((option, index) => ({
      ...option,
      displayOrder: index + 1,
    }));
  }

  private blankExactOccurrence(sentence: string, word: string): string | null {
    if (!word) return null;
    const matches: number[] = [];
    let position = sentence.indexOf(word);
    while (position >= 0) {
      const before = position === 0 ? '' : sentence[position - 1];
      const after = sentence[position + word.length] ?? '';
      if (
        (!before || !WORD_CHARACTER.test(before)) &&
        (!after || !WORD_CHARACTER.test(after))
      ) {
        matches.push(position);
      }
      position = sentence.indexOf(word, position + word.length);
    }
    if (matches.length !== 1) return null;
    const start = matches[0];
    return `${sentence.slice(0, start)}___${sentence.slice(start + word.length)}`;
  }

  private normalize(value: string): string {
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  }

  private stableHash(value: string): number {
    let hash = 0;
    for (const character of value) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
    }
    return hash;
  }
}
