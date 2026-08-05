import type { Pb5Parser, Pb5MatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 'yyy' 일 때, file_name 을 "클래스Impl" 로 보고
 *       클래스 단위로 매칭한다. (메소드 없음)
 *
 *   예) "EmpProcess" → { className: 'EmpProcessImpl' }
 */
export class Pb5ClassImplParser implements Pb5Parser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'Pb5ClassImplParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(Pb5ClassImplParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): Pb5MatchTarget {
    return { className: fileName.trim() + 'Impl' };
  }
}
