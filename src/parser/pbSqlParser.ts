import type { PbParser, PbMatchTarget } from './parser';
import { categoryMap } from '../config/categoryMap';

/**
 * 동작: 대분류가 'zzz' 일 때, file_name(프로그램ID)을 SQL 파일명으로 본다.
 *       프로그램ID 뒤에 '.sql' 확장자를 붙인다.
 *
 *   예) "ACCT001" → { fileName: 'ACCT001.sql' }
 *
 * pb(구버전) 'zzz' 대분류의 SQL 파일 네이밍 규칙.
 * (확장자를 직접 포함하므로 resolveProgramFileName 의 기본 '.pc' 부여가 적용되지 않는다.)
 */
export class PbSqlParser implements PbParser {
  // categoryMap 키. supports()는 categoryMap.get(BIG_CATEGORY) Set 에 bigCategory 포함 여부로 판단.
  static readonly BIG_CATEGORY = 'PbSqlParser';

  supports(bigCategory: string | null | undefined): boolean {
    return bigCategory != null && (categoryMap.get(PbSqlParser.BIG_CATEGORY)?.has(bigCategory) ?? false);
  }

  parse(fileName: string): PbMatchTarget {
    return { fileName: fileName.trim() + '.sql' };
  }
}
