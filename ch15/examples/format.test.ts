import { describe, expect, it } from 'vitest';
import { formatWon } from '../../src/rules/format.js';

describe('금액 표시', () => {
  it('3,000원처럼 천 단위 쉼표와 원을 붙인다', () => {
    expect(formatWon(3000)).toBe('3,000원');
    expect(formatWon(1500)).toBe('1,500원');
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });
  it('정수가 아닌 금액은 받지 않는다', () => {
    expect(() => formatWon(1500.5)).toThrow();
  });
});
