import type { PbParser, PbMatchTarget } from './parser';
import { transferFileNameMap } from '../config/transferFileNameMap';

/**
 * PB transfer 파일명 매핑.
 * 키(file_name/프로그램ID)가 이 맵에 있으면 PbTransferFileNameParser 가 담당하고,
 * 값(= 실제 PB transfer 소스 파일명)으로 매칭한다. 실제 운영 매핑을 여기에 채운다.
 */

/**
 * 동작: 대분류가 아니라 "파일명"으로 담당 여부를 가린다.
 *   - supports: file_name 이 transferFileNameMap 에 있는지만 본다(대분류 무시).
 *   - parse:    맵의 값(실제 transfer 소스 파일명)을 돌려준다.
 * 등록: PbDefaultParser 바로 앞(파일명 매핑이 있으면 default 보다 우선).
 */
export class PbTransferFileNameParser implements PbParser {
  supports(_bigCategory: string | null | undefined, fileName: string | null | undefined): boolean {
    return fileName != null && transferFileNameMap.has(fileName.trim());
  }

  parse(fileName: string): PbMatchTarget {
    const key = fileName.trim();
    return { fileName: transferFileNameMap.get(key) ?? key };
  }
}
