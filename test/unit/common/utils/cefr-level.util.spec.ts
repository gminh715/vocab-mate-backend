import { CefrLevel } from '../../../../generated/prisma/enums';
import {
  isCefrAtOrAbove,
  isCefrInLearningRange,
  isCefrLevel,
} from '../../../../src/common/utils/cefr-level.util';

const levels = [
  CefrLevel.A1,
  CefrLevel.A2,
  CefrLevel.B1,
  CefrLevel.B2,
  CefrLevel.C1,
  CefrLevel.C2,
] as const;

describe('CEFR ordering', () => {
  it.each(
    levels.flatMap((candidate, candidateRank) =>
      levels.map((threshold, thresholdRank) => ({
        candidate,
        threshold,
        expected: candidateRank >= thresholdRank,
      })),
    ),
  )(
    'returns $expected for $candidate >= $threshold',
    ({ candidate, threshold, expected }) => {
      expect(isCefrAtOrAbove(candidate, threshold)).toBe(expected);
    },
  );

  it.each(
    levels.flatMap((candidate, candidateRank) =>
      levels.flatMap((current, currentRank) =>
        levels.map((target, targetRank) => ({
          candidate,
          current,
          target,
          expected: candidateRank >= currentRank && candidateRank <= targetRank,
        })),
      ),
    ),
  )(
    'returns $expected for $current <= $candidate <= $target',
    ({ candidate, current, target, expected }) => {
      expect(isCefrInLearningRange(candidate, current, target)).toBe(expected);
    },
  );

  it.each(levels)('recognizes %s as a CEFR level', (level) => {
    expect(isCefrLevel(level)).toBe(true);
  });

  it.each([null, undefined, '', 'B3', 'native', 3])(
    'rejects invalid CEFR value %p',
    (value) => {
      expect(isCefrLevel(value)).toBe(false);
    },
  );
});
