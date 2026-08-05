// 체크리스트 점검 상태 5값 — 라벨/색을 패널·모아보기에서 공유한다.
// NONE(선택안함): 아직 판단하지 않은 기본 상태. 미설정(check_list 행 없음)도 NONE으로 표시한다.
export type ChecklistStatus = 'NONE' | 'YES' | 'NO' | 'NA' | 'HOLD';

export const CHECKLIST_STATUSES: ChecklistStatus[] = ['NONE', 'YES', 'NO', 'NA', 'HOLD'];

export const STATUS_LABEL: Record<ChecklistStatus, string> = {
  NONE: '선택안함',
  YES: '예',
  NO: '아니오',
  NA: '해당없음',
  HOLD: '판단 보류',
};

// 선택된 버튼/강조용 (진한 배경). NONE 은 '비어있음'을 나타내는 옅은 중립 회색(NA 보다 연하게).
export const STATUS_SOLID: Record<ChecklistStatus, string> = {
  NONE: 'bg-slate-200 text-slate-500',
  YES: 'bg-emerald-500 text-white',
  NO: 'bg-red-500 text-white',
  NA: 'bg-slate-400 text-white',
  HOLD: 'bg-amber-400 text-amber-900',
};

// 셀/뱃지용 (연한 배경)
export const STATUS_SOFT: Record<ChecklistStatus, string> = {
  NONE: 'bg-slate-50 text-slate-400',
  YES: 'bg-emerald-100 text-emerald-800',
  NO: 'bg-red-100 text-red-800',
  NA: 'bg-slate-100 text-slate-600',
  HOLD: 'bg-amber-100 text-amber-800',
};

// 진행률 계산용 — '판단 완료'(YES/NO/NA)로 친다. HOLD(보류)·NONE(선택안함)은 미판단.
export const isDecided = (s: ChecklistStatus): boolean => s !== 'HOLD' && s !== 'NONE';
