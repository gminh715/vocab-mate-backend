import { CefrLevel } from '../../../../generated/prisma/enums';
import { isCefrAtOrAbove } from '../../../../src/common/utils/cefr-level.util';

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
});
