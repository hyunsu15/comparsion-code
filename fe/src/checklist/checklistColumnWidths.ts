// 체크리스트 매트릭스 컬럼 너비 — DB 없이 localStorage 로만 관리.
// 순수 함수(clamp/widthOf/withWidth/gridTemplate/totalWidth)와 localStorage 입출력(load/save)을
// 분리해 순수 로직만 테스트 가능하게 둔다. (favorites.ts 와 동일한 패턴)

/** 컬럼별 너비(px). check 는 점검 항목(check_point_id)별 너비 — 없으면 기본값. */
export interface ColumnWidths {
  program: number;
  progress: number;
  check: Record<number, number>;
}

/** 리사이즈 대상 컬럼 키 — 'program' | 'progress' | check_point_id(number). */
export type ColumnKey = 'program' | 'progress' | number;

export const DEFAULT_PROGRAM = 560; // 프로그램명("PB소스 / ID")이 길어 기본값을 넓게(기존 280의 2배)
export const DEFAULT_CHECK = 120;
export const DEFAULT_PROGRESS = 110;

const MIN_PROGRAM = 140;
const MIN_CHECK = 72;
const MIN_PROGRESS = 80;

/** 기본 너비(점검 항목은 비워두고 조회 시 DEFAULT_CHECK 로 채운다). */
export const defaultColumnWidths = (): ColumnWidths => ({
  program: DEFAULT_PROGRAM,
  progress: DEFAULT_PROGRESS,
  check: {},
});

/** 컬럼별 최소 너비 — 그 아래로는 줄지 않는다(내용이 읽히는 하한). */
export const minWidth = (key: ColumnKey): number =>
  key === 'program' ? MIN_PROGRAM : key === 'progress' ? MIN_PROGRESS : MIN_CHECK;

/** 너비를 최소값 이상의 정수로 보정한다. */
export const clampWidth = (key: ColumnKey, width: number): number =>
  Math.max(minWidth(key), Math.round(width));

/** 특정 컬럼의 현재 너비(미설정 점검 항목은 DEFAULT_CHECK). */
export const widthOf = (w: ColumnWidths, key: ColumnKey): number => {
  if (key === 'program') return w.program;
  if (key === 'progress') return w.progress;
  return w.check[key] ?? DEFAULT_CHECK;
};

/** 한 컬럼 너비만 바꾼 새 객체를 반환한다(원본 불변, 최소값 보정 포함). */
export const withWidth = (w: ColumnWidths, key: ColumnKey, width: number): ColumnWidths => {
  const v = clampWidth(key, width);
  if (key === 'program') return { ...w, program: v };
  if (key === 'progress') return { ...w, progress: v };
  return { ...w, check: { ...w.check, [key]: v } };
};

/** grid-template-columns 문자열: 프로그램 + 진행률 + 점검 항목들. (진행률을 프로그램 바로 오른쪽에) */
export const gridTemplate = (w: ColumnWidths, checkPointIds: number[]): string =>
  [`${w.program}px`, `${w.progress}px`, ...checkPointIds.map((id) => `${w.check[id] ?? DEFAULT_CHECK}px`)].join(' ');

/** 전체 너비 합(px). */
export const totalWidth = (w: ColumnWidths, checkPointIds: number[]): number =>
  w.program + checkPointIds.reduce((sum, id) => sum + (w.check[id] ?? DEFAULT_CHECK), 0) + w.progress;

const KEY = 'checklistColumnWidths';

/** localStorage 에서 너비를 읽는다(손상/부재 시 기본값). */
export const loadColumnWidths = (): ColumnWidths => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultColumnWidths();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultColumnWidths();
    const p = parsed as Record<string, unknown>;
    const program = typeof p.program === 'number' ? p.program : DEFAULT_PROGRAM;
    const progress = typeof p.progress === 'number' ? p.progress : DEFAULT_PROGRESS;
    const check: Record<number, number> = {};
    if (p.check && typeof p.check === 'object') {
      for (const [k, v] of Object.entries(p.check as Record<string, unknown>)) {
        const id = Number(k);
        if (Number.isFinite(id) && typeof v === 'number') check[id] = v;
      }
    }
    return { program, progress, check };
  } catch {
    return defaultColumnWidths();
  }
};

/** 너비를 localStorage 에 저장한다(실패는 조용히 무시 — 시크릿 모드 등). */
export const saveColumnWidths = (w: ColumnWidths): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* noop */
  }
};
