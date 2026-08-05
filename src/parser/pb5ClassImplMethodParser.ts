import type { Pb5Parser, Pb5MatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 'xxx' 일 때, file_name 을 "클래스Impl.메소드" 로 보고
 *       클래스 + 메소드 단위로 매칭한다. (메소드 단위 점프용)
 *
 *   예) "EmpProcessImpl.processEmployee"
 *        → { className: 'EmpProcessImpl', methodName: 'processEmployee' }
 */
export class Pb5ClassImplMethodParser implements Pb5Parser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'Pb5ClassImplMethodParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(Pb5ClassImplMethodParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): Pb5MatchTarget {
    const name = fileName.trim();
    const dot = name.indexOf('.');
    // 점(.)이 없으면 메소드 없이 클래스만
    if (dot < 0) return { className: name };
    return {
      className: name.slice(0, dot)+"Impl",
      methodName: name.slice(dot + 1),
    };
  }
}
