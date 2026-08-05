import type { Pb5Parser, Pb5MatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 'zzz' 일 때, file_name 을 "<file_name>.xml" 로 본다.
 *
 *   예) "ACCT001" → { className: 'ACCT001.xml' }
 *
 * (xml 은 클래스가 아니지만, 현재 Pb5MatchTarget 은 className 필드뿐이라 거기에 담는다.
 *  파일 기반 매칭을 별도 필드로 구분하고 싶으면 Pb5MatchTarget 에 fileName 을 추가해도 된다.)
 */
export class Pb5XmlParser implements Pb5Parser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'Pb5XmlParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(Pb5XmlParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): Pb5MatchTarget {
    return { className: fileName.trim() + '.xml' };
  }
}
