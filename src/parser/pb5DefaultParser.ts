import type { Pb5Parser, Pb5MatchTarget } from './parser';

/**
 * 디폴트(fallback) pb5 parser.
 * 어떤 대분류도 전담 parser 가 없을 때 쓰이는 최후순위 parser.
 *  - supports() 는 항상 true → 반드시 레지스트리 "맨 마지막"에 등록해야 한다(first-match).
 *  - parse 는 file_name 을 가공 없이 그대로 className 으로 쓴다.
 */
export class Pb5DefaultParser implements Pb5Parser {
  supports(): boolean {
    return true;
  }

  parse(fileName: string): Pb5MatchTarget {
    return { className: fileName };
  }
}
