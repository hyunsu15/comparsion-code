import { describe, it, expect } from 'vitest';
import { deriveTypeOptions, deriveWorkOptions, matchesCategory, averageProgress } from '../src/checklist/checklistCategoryFilter';
import type { ChecklistMatrixRow, ChecklistMatrixColumn } from '../src/checklist/checklistService';

const cols: ChecklistMatrixColumn[] = [
  { check_point_id: 1, check_point: 'C1', detail: null },
  { check_point_id: 2, check_point: 'C2', detail: null },
];

// a: 회원/인증 decided 2/2 · b: 계좌/이체 1/2 · c: 계좌/신규 0/2 · d: null/null 2/2
const rows: ChecklistMatrixRow[] = [
  { service_id: 'a', big_category: '회원', middle_category: '인증', statuses: { 1: 'YES', 2: 'NO' }, comments: {} },
  { service_id: 'b', big_category: '계좌', middle_category: '이체', statuses: { 1: 'YES', 2: 'HOLD' }, comments: {} },
  { service_id: 'c', big_category: '계좌', middle_category: '신규', statuses: {}, comments: {} },
  { service_id: 'd', big_category: null, middle_category: null, statuses: { 1: 'NA', 2: 'YES' }, comments: {} },
];

describe('deriveTypeOptions', () => {
  it('distinct 유형을 sortBigCategories 순서로, null 제외', () => {
    expect(deriveTypeOptions(rows)).toEqual(['회원', '계좌']);
  });
  it('빈 입력 → []', () => {
    expect(deriveTypeOptions([])).toEqual([]);
  });
});

describe('deriveWorkOptions', () => {
  it('유형 미선택이면 전 행의 업무 distinct(입력 순서)', () => {
    expect(deriveWorkOptions(rows, '')).toEqual(['인증', '이체', '신규']);
  });
  it('유형 선택 시 그 유형의 업무만', () => {
    expect(deriveWorkOptions(rows, '계좌')).toEqual(['이체', '신규']);
    expect(deriveWorkOptions(rows, '회원')).toEqual(['인증']);
  });
});

describe('matchesCategory', () => {
  it('둘 다 전체면 항상 true', () => {
    expect(matchesCategory(rows[0], '', '')).toBe(true);
  });
  it('유형만', () => {
    expect(matchesCategory(rows[0], '회원', '')).toBe(true);
    expect(matchesCategory(rows[0], '계좌', '')).toBe(false);
  });
  it('업무만(유형 독립)', () => {
    expect(matchesCategory(rows[0], '', '인증')).toBe(true);
    expect(matchesCategory(rows[0], '', '이체')).toBe(false);
  });
  it('유형+업무', () => {
    expect(matchesCategory(rows[1], '계좌', '이체')).toBe(true);
    expect(matchesCategory(rows[1], '계좌', '신규')).toBe(false);
  });
});

describe('averageProgress', () => {
  it('빈 rows → 0', () => { expect(averageProgress([], cols)).toBe(0); });
  it('빈 columns → 0', () => { expect(averageProgress(rows, [])).toBe(0); });
  it('a,b,c 평균 (1.0+0.5+0)/3 → 50', () => {
    expect(averageProgress([rows[0], rows[1], rows[2]], cols)).toBe(50);
  });
  it('a,d 평균 (1.0+1.0)/2 → 100 (NA/YES는 판단완료)', () => {
    expect(averageProgress([rows[0], rows[3]], cols)).toBe(100);
  });
});
