import { CefrLevel } from '../../../generated/prisma/enums';

export const CEFR_RANK = {
  [CefrLevel.A1]: 1,
  [CefrLevel.A2]: 2,
  [CefrLevel.B1]: 3,
  [CefrLevel.B2]: 4,
  [CefrLevel.C1]: 5,
  [CefrLevel.C2]: 6,
} as const satisfies Record<CefrLevel, number>;

export const isCefrAtOrAbove = (
  candidate: CefrLevel,
  threshold: CefrLevel,
): boolean => CEFR_RANK[candidate] >= CEFR_RANK[threshold];
