import { describe, it, expect } from 'vitest';
import { getTotalPages, getPageNumbers } from '../src/pagination';

describe('getTotalPages', () => {
  it('0건이면 최소 1페이지', () => { expect(getTotalPages(0, 20)).toBe(1); });
  it('정확히 나누어떨어짐', () => { expect(getTotalPages(40, 20)).toBe(2); });
  it('나머지가 있으면 올림', () => { expect(getTotalPages(41, 20)).toBe(3); });
});

describe('getPageNumbers', () => {
  it('전체가 버튼 수보다 적으면 그대로', () => {
    expect(getPageNumbers(1, 3, 5)).toEqual([1, 2, 3]);
  });
  it('중앙 정렬 슬라이딩', () => {
    expect(getPageNumbers(5, 10, 5)).toEqual([3, 4, 5, 6, 7]);
  });
  it('시작 경계', () => {
    expect(getPageNumbers(1, 10, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('끝 경계', () => {
    expect(getPageNumbers(10, 10, 5)).toEqual([6, 7, 8, 9, 10]);
  });
});
