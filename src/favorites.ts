// 프로그램(service_id) 즐겨찾기 — DB 없이 localStorage 로만 관리.
// 순수 함수(toggle/isFavorite)와 localStorage 입출력(load/save)을 분리해 테스트 가능하게 둔다.

const KEY = 'favoriteServiceIds';

/** localStorage 에서 즐겨찾기 service_id 목록을 읽는다(손상/부재 시 빈 배열). */
export const loadFavorites = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** 즐겨찾기 목록을 localStorage 에 저장한다. */
export const saveFavorites = (ids: string[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* 저장 실패는 조용히 무시(시크릿 모드 등) */
  }
};

/** id 가 있으면 제거, 없으면 끝에 추가한 새 배열을 반환(원본 불변). */
export const toggleFavorite = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

/** id 가 즐겨찾기에 포함되는지. */
export const isFavorite = (ids: string[], id: string): boolean => ids.includes(id);
