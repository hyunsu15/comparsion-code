import type { Pb5Parser, Pb5MatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 '서비스' 일 때, file_name(프로그램ID)을 "클래스Service" 로 보고
 *       클래스 단위로 매칭한다. (메소드 없음)
 *
 *   예) "EmpProcess" → { className: 'EmpProcessService' }
 *
 * pb5(신버전) '서비스' 대분류의 자바 서비스 클래스 네이밍 규칙.
 * (pb 측 짝은 PbServiceParser = <id>_APS)
 */
export class Pb5ServiceParser implements Pb5Parser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'Pb5ServiceParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(Pb5ServiceParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): Pb5MatchTarget {
    return { className: fileName.trim()+"Service" };
  }
}
