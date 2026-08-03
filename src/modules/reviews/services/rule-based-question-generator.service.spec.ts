import {
  CefrLevel,
  QuestionGenerationSource,
  QuestionType,
} from '../../../../generated/prisma/enums';
import {
  RuleBasedQuestionGeneratorService,
  type VocabularyQuestionSnapshot,
} from './rule-based-question-generator.service';

describe('RuleBasedQuestionGeneratorService', () => {
  const service = new RuleBasedQuestionGeneratorService();
  const vocabulary: VocabularyQuestionSnapshot = {
    id: 'target',
    articleSentenceTermId: 'term-target',
    savedWordDisplay: 'engaging',
    savedLemma: 'engage',
    savedPartOfSpeech: 'adjective',
    savedCefrLevel: CefrLevel.B1,
    savedContextSentence: 'The lesson was engaging for everyone.',
    savedMeaningVi: 'hấp dẫn',
    savedExplanation: 'Interesting in this lesson context.',
    categoryId: 'education',
  };
  const candidates: VocabularyQuestionSnapshot[] = [
    {
      ...vocabulary,
      id: 'same-pos',
      articleSentenceTermId: 'term-same-pos',
      savedWordDisplay: 'difficult',
      savedLemma: 'difficult',
      savedMeaningVi: 'khó',
      savedContextSentence: 'The exercise was difficult for beginners.',
    },
    {
      ...vocabulary,
      id: 'other-pos',
      articleSentenceTermId: 'term-other-pos',
      savedWordDisplay: 'teacher',
      savedLemma: 'teacher',
      savedPartOfSpeech: 'noun',
      savedMeaningVi: 'giáo viên',
      savedContextSentence: 'The teacher explained the lesson.',
    },
  ];

  it.each([
    [QuestionType.SELECT_MEANING, 'hấp dẫn'],
    [QuestionType.SELECT_WORD, 'engaging'],
    [
      QuestionType.SELECT_CORRECT_CONTEXT,
      'The lesson was engaging for everyone.',
    ],
  ])('creates an unambiguous %s question', (questionType, correctText) => {
    const generated = service.generate(vocabulary, questionType, candidates);

    expect(generated).toMatchObject({
      generationSource: QuestionGenerationSource.RULE_BASED,
      questionType,
      blankSentence: null,
      correctAnswerText: null,
    });
    expect(generated?.options).toHaveLength(3);
    expect(generated?.options.filter(({ isCorrect }) => isCorrect)).toEqual([
      expect.objectContaining({ optionText: correctText }),
    ]);
    expect(
      new Set(generated?.options.map(({ optionText }) => optionText)).size,
    ).toBe(generated?.options.length);
  });

  it('prioritizes compatible parts of speech when option space is bounded', () => {
    const extraCandidates = Array.from({ length: 4 }, (_, index) => ({
      ...candidates[1],
      id: `noun-${index}`,
      articleSentenceTermId: `noun-term-${index}`,
      savedLemma: `noun-${index}`,
      savedMeaningVi: `noun meaning ${index}`,
    }));
    const generated = service.generate(
      vocabulary,
      QuestionType.SELECT_MEANING,
      [...extraCandidates, candidates[0]],
    );

    expect(generated?.options.map(({ optionText }) => optionText)).toContain(
      'khó',
    );
  });

  it('blanks the one exact saved occurrence without case folding or fallback text', () => {
    expect(
      service.generate(vocabulary, QuestionType.FILL_BLANK, []),
    ).toMatchObject({
      blankSentence: 'The lesson was ___ for everyone.',
      correctAnswerText: 'engaging',
      options: [],
    });
    expect(
      service.generate(
        { ...vocabulary, savedContextSentence: 'Engaging lesson.' },
        QuestionType.FILL_BLANK,
        [],
      ),
    ).toBeNull();
    expect(
      service.generate(
        {
          ...vocabulary,
          savedContextSentence: 'engaging was engaging twice.',
          savedWordDisplay: 'engaging',
        },
        QuestionType.FILL_BLANK,
        [],
      ),
    ).toBeNull();
  });

  it('refuses multiple choice without a compatible, distinct distractor', () => {
    expect(
      service.generate(vocabulary, QuestionType.SELECT_MEANING, []),
    ).toBeNull();
    expect(
      service.generate(vocabulary, QuestionType.SELECT_MEANING, [
        { ...candidates[0], savedMeaningVi: ' hấp dẫn ' },
      ]),
    ).toBeNull();
  });

  it('matches only a cache entry built from the same saved snapshot', () => {
    const generated = service.generate(
      vocabulary,
      QuestionType.SELECT_WORD,
      candidates,
    );
    expect(generated).not.toBeNull();
    if (!generated) return;

    expect(service.matchesCache(generated, generated)).toBe(true);
    expect(
      service.canReuseCache(generated, vocabulary, QuestionType.SELECT_WORD, [
        ...candidates,
        {
          ...candidates[0],
          id: 'newer-candidate',
          articleSentenceTermId: 'newer-term',
          savedLemma: 'newer',
          savedWordDisplay: 'newer',
        },
      ]),
    ).toBe(true);
    expect(
      service.matchesCache(
        { ...generated, prompt: 'Stale generated prompt' },
        generated,
      ),
    ).toBe(false);
  });
});
