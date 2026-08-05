import type { ChecklistMatrixRow, ChecklistMatrixColumn } from './checklistService';
import { isDecided } from './checklistStatus';
import { sortBigCategories } from '../config/categoryOrder';

/** 행들의 distinct 유형(big_category) — sortBigCategories 순서. null/빈값 제외. */
export const deriveTypeOptions = (rows: ChecklistMatrixRow[]): string[] => {
   const set = new Set<string>();
   for (const r of rows) if (r.big_category) set.add(r.big_category);
   return sortBigCategories(Array.from(set));
};

/** 선택 유형 안의 distinct 업무(middle_category). 유형 미선택('')이면 전 행. 데이터 순서. */
export const deriveWorkOptions = (rows: ChecklistMatrixRow[], selectedType: string): string[] => {
   const set = new Set<string>();
   for (const r of rows) {
      if (selectedType && r.big_category !== selectedType) continue;
      if (r.middle_category) set.add(r.middle_category);
   }
   return Array.from(set);
};

/** 행이 현재 유형/업무 선택에 부합하는지. 빈 문자열은 '전체'(제약 없음). */
export const matchesCategory = (row: ChecklistMatrixRow, selectedType: string, selectedWork: string): boolean => {
   if (selectedType && row.big_category !== selectedType) return false;
   if (selectedWork && row.middle_category !== selectedWork) return false;
   return true;
};

/** 필터된 행들의 평균 진행률(%) = mean(decided/total). 행/열 0개면 0. 반올림 정수. */
export const averageProgress = (rows: ChecklistMatrixRow[], columns: ChecklistMatrixColumn[]): number => {
   if (rows.length === 0 || columns.length === 0) return 0;
   const sum = rows.reduce((acc, row) => {
      const decided = columns.filter((c) => isDecided(row.statuses[c.check_point_id] ?? 'HOLD')).length;
      return acc + decided / columns.length;
   }, 0);
   return Math.round((sum / rows.length) * 100);
};
