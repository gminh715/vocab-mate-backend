import { toSafeCount } from '../../../../src/modules/analytics/analytics.helpers';

describe('analytics helpers', () => {
  it('converts database counts safely for JSON responses', () => {
    expect(toSafeCount(9n)).toBe(9);
    expect(() => toSafeCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      'Analytics count is outside the safe integer range',
    );
  });
});
