/**
 * 대분류(big_category) 표시 순서 지정.
 *
 * - BIG_CATEGORY_ORDER 에 적은 순서대로 셀렉트에 노출된다.
 * - 목록에 없는 대분류는 뒤쪽에, 원래(데이터) 순서를 유지한 채 붙는다.
 * - 순서를 바꾸고 싶으면 이 배열만 편집하면 된다.
 */
//TODO 순위를 넣어라. 한번 만들면 교환해
export const BIG_CATEGORY_ORDER: string[] = [
  
];

/**
 * 대분류 배열을 BIG_CATEGORY_ORDER 기준으로 정렬한다.
 * 목록에 있는 것 우선(지정 순서), 없는 것은 뒤에 입력 순서대로(안정 정렬).
 *
 * @example
 *   sortBigCategories(['서비스', '계좌', '기타', '회원'])
 *   // → ['회원', '계좌', '서비스', '기타']
 */
export function sortBigCategories(categories: string[]): string[] {
  const rank = new Map(BIG_CATEGORY_ORDER.map((name, i) => [name, i]));
  const rankOf = (name: string) =>
    rank.has(name) ? (rank.get(name) as number) : Number.MAX_SAFE_INTEGER;

  // index 를 보조키로 써서 동순위(목록에 없는 것끼리)는 원래 순서를 유지한다.
  return categories
    .map((name, index) => ({ name, index }))
    .sort((a, b) => rankOf(a.name) - rankOf(b.name) || a.index - b.index)
    .map((x) => x.name);
}
