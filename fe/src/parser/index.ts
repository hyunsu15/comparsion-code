import type { Pb5Parser, PbParser } from './parser';
import { Pb5ClassImplMethodParser } from './pb5ClassImplMethodParser';
import { Pb5ClassImplParser } from './pb5ClassImplParser';
import { Pb5ServiceParser } from './pb5ServiceParser';
import { Pb5XmlParser } from './pb5XmlParser';
import { Pb5DefaultParser } from './pb5DefaultParser';
import { PbServiceParser } from './pbServiceParser';
import { PbSqlParser } from './pbSqlParser';
import { PbTransferFileNameParser } from './pbTransferFileNameParser';
import { PbTransferFileNameMethodParser } from './pbTransferFileNameMethodParser';
import { PbDefaultParser } from './pbDefaultParser';

export type {
  PbParser,
  Pb5Parser,
  PbMatchTarget,
  Pb5MatchTarget,
  SourceParser,
} from './parser';
export { Pb5ClassImplMethodParser } from './pb5ClassImplMethodParser';
export { Pb5ClassImplParser } from './pb5ClassImplParser';
export { Pb5ServiceParser } from './pb5ServiceParser';
export { Pb5XmlParser } from './pb5XmlParser';
export { Pb5DefaultParser } from './pb5DefaultParser';
export { PbServiceParser } from './pbServiceParser';
export { PbSqlParser } from './pbSqlParser';
export { PbTransferFileNameParser } from './pbTransferFileNameParser';
export { PbTransferFileNameMethodParser } from './pbTransferFileNameMethodParser';
export { transferFileNameMap, transferFileNameMethodMap } from '../config/transferFileNameMap';
export { PbDefaultParser } from './pbDefaultParser';

/**
 * 등록된 pb5(신버전) parser 목록. 위에서부터 first-match.
 *
 * ⚠️ Pb5DefaultParser 는 supports()=true 라 무엇이든 매칭되므로
 *    반드시 "맨 마지막"(최후순위)에 둔다. 그 뒤에 둔 parser 는 영원히 안 잡힘.
 *    (전담 parser 들의 BIG_CATEGORY 는 서로 겹치지 않게 둘 것)
 */
const PB5_PARSERS: Pb5Parser[] = [
  new Pb5ClassImplMethodParser(), // 'xxx'(placeholder) — Class.method 단위
  new Pb5ClassImplParser(),       // 'yyy'(placeholder) — <id>Impl
  new Pb5ServiceParser(),         // '서비스' — <id>Service
  new Pb5XmlParser(),             // 'zzz'(placeholder) — <file_name>.xml
  new Pb5DefaultParser(),         // fallback — file_name 그대로 (항상 마지막)
];

/**
 * 등록된 pb(구버전) parser 목록.
 * pb 는 매칭 대상 타입(PbMatchTarget)이 pb5 와 달라 레지스트리를 분리한다.
 * PbDefaultParser 도 supports()=true 라 반드시 "맨 마지막"에 둔다.
 */
const PB_PARSERS: PbParser[] = [
  new PbServiceParser(), // '서비스' — <id>_APS
  new PbSqlParser(), // 'zzz'(placeholder) — <file_name>.sql (확장자 직접 포함)
  new PbTransferFileNameParser(), // file_name 이 transferFileNameMap 에 있으면 담당 (default 앞)
  new PbTransferFileNameMethodParser(), // file_name 이 transferFileNameMethodMap 에 있으면 메소드 단위 (default 앞)
  new PbDefaultParser(), // fallback — file_name 그대로 (항상 마지막)
];

/**
 * 대분류에 맞는 pb5 parser 를 찾는다.
 * Pb5DefaultParser 가 fallback 으로 있어 항상 하나는 매칭된다.
 *
 * @example
 *   const parser = resolvePb5Parser(service.big_category, service.file_name);
 *   const target = parser?.parse(service.file_name);  // { className, methodName? }
 */
export function resolvePb5Parser(
  bigCategory: string | null | undefined,
  fileName: string | null | undefined,
): Pb5Parser | undefined {
  return PB5_PARSERS.find((p) => p.supports(bigCategory, fileName));
}

/**
 * 대분류에 맞는 pb parser 를 찾는다.
 * PbDefaultParser 가 fallback 으로 있어 항상 하나는 매칭된다.
 *
 * @example
 *   const parser = resolvePbParser(service.big_category, service.file_name);
 *   const target = parser?.parse(service.file_name);  // { fileName }
 */
export function resolvePbParser(
  bigCategory: string | null | undefined,
  fileName: string | null | undefined,
): PbParser | undefined {
  return PB_PARSERS.find((p) => p.supports(bigCategory, fileName));
}
