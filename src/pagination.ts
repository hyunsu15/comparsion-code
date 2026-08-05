/** 총 페이지 수 (최소 1). */
export const getTotalPages = (totalCount: number, size: number): number =>
  Math.max(1, Math.ceil(totalCount / size));

/**
 * 페이지 바에 표시할 페이지 번호 목록.
 * 현재 페이지를 중심으로 최대 maxButtons 개를 슬라이딩 윈도우로 반환한다.
 */
export const getPageNumbers = (current: number, totalPages: number, maxButtons = 5): number[] => {
  const count = Math.min(maxButtons, totalPages);
  let start = current - Math.floor(count / 2);
  if (start < 1) start = 1;
  if (start + count - 1 > totalPages) start = totalPages - count + 1;
  return Array.from({ length: count }, (_, i) => start + i);
};
