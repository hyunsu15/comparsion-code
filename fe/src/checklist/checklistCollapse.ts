// 체크리스트 카테고리 접힘 상태 — 프로그램(service_id)별로 '사용자가 펼친(연) 카테고리'만 localStorage 에 기억한다.
// 기본은 '전부 접힘' — 그래서 처음 여는 프로그램이나 새로 추가된 카테고리는 항상 접힌 채로 시작한다(opt-in 펼침).
// 순수 함수(계산)와 localStorage 입출력(load/save)을 분리해 테스트 가능하게 둔다(favorites.ts 와 동일 규약).

const KEY = 'checklistExpandedByProgram';

// service_id → 펼친(연) 카테고리 제목 목록
export type ExpandedMap = Record<string, string[]>;

/** 전체 제목 중 '펼친 목록(expanded)'에 없는 것 = 접힐 카테고리. 전체 순서 보존 + 중복 제거. */
export const collapsedTitles = (allTitles: string[], expanded: string[]): string[] => {
  const open = new Set(expanded);
  return [...new Set(allTitles)].filter((t) => !open.has(t));
};

/** 전체 제목 중 '접힘 목록(collapsed)'에 없는 것 = 저장할 펼침 목록. collapsedTitles 의 역(저장용). */
export const openTitles = (allTitles: string[], collapsed: string[]): string[] => {
  const closed = new Set(collapsed);
  return [...new Set(allTitles)].filter((t) => !closed.has(t));
};

/** 맵에서 프로그램의 펼침 목록을 읽는다. 없으면 빈 배열(=전부 접힘). */
export const getExpanded = (map: ExpandedMap, serviceId: string): string[] => map[serviceId] ?? [];

/** 프로그램의 펼침 목록을 바꾼 새 맵을 반환(원본 불변). */
export const setExpanded = (map: ExpandedMap, serviceId: string, titles: string[]): ExpandedMap => ({
  ...map,
  [serviceId]: titles,
});

/** localStorage 에서 전체 맵을 읽는다(손상/부재 시 빈 맵). */
export const loadExpandedMap = (): ExpandedMap => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ExpandedMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
};

/** 프로그램의 펼침 목록을 localStorage 에 저장한다(빈 serviceId 는 무시). */
export const saveExpandedTitles = (serviceId: string, titles: string[]): void => {
  if (!serviceId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(setExpanded(loadExpandedMap(), serviceId, titles)));
  } catch {
    /* 저장 실패는 조용히 무시(시크릿 모드 등) */
  }
};

/** 프로그램의 펼침 목록을 localStorage 에서 바로 읽는다(없으면 빈 배열=전부 접힘). */
export const loadExpandedTitles = (serviceId: string): string[] => getExpanded(loadExpandedMap(), serviceId);
