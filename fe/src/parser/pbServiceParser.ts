import type { PbParser, PbMatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 '서비스' 일 때, file_name(프로그램ID)을 PB 물리 파일명으로 본다.
 *       PB 물리 파일은 프로그램ID 뒤에 '_APS' 접미사가 붙는다.
 *
 *   예) "ACCT001" → { fileName: 'ACCT001_APS' }
 *
 * pb(구버전) '서비스' 대분류의 물리 파일 네이밍 규칙.
 * (pb5 측 짝은 Pb5ServiceParser = <id>Service)
 */
export class PbServiceParser implements PbParser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'PbServiceParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(PbServiceParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): PbMatchTarget {
    return { fileName: fileName.trim()+"_APS" };
  }
}
