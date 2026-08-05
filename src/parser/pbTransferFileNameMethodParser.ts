import type { PbParser, PbMatchTarget } from './parser';
import { transferFileNameMethodMap } from '../config/transferFileNameMap';

/**
 * 동작: 대분류가 아니라 "파일명"으로 담당 여부를 가린다(대분류 무시).
 *   - supports: file_name 이 transferFileNameMethodMap 에 있는지만 본다.
 *   - parse:    입력 file_name 을 methodName(점프할 메소드)으로, 맵의 값(물리 PB 소스 파일명)을
 *               fileName 으로 쓴다. 값에 확장자('.pc' 또는 '.c') 접미사가 있으면 떼어 낸다.
 * 등록: PbDefaultParser 바로 앞.
 *
 *   예) 맵 ['doTransfer', 'ACCT001Transfer.pc'] → parse("doTransfer")
 *        → { fileName: 'ACCT001Transfer', methodName: 'doTransfer' }
 *       ('ACCT001Transfer.c' 로 와도 동일하게 'ACCT001Transfer' 가 된다)
 *
 * (PbTransferFileNameParser 의 메소드 단위 변형.)
 */
export class PbTransferFileNameMethodParser implements PbParser {
  supports(_bigCategory: string | null | undefined, fileName: string | null | undefined): boolean {
    return fileName != null && transferFileNameMethodMap.has(fileName.trim());
  }

  parse(fileName: string): PbMatchTarget {
    const key = fileName.trim();
    const mapped = transferFileNameMethodMap.get(key) ?? key;
    // 맵 값에 물리 PB 소스 확장자('.pc' 또는 '.c') 접미사가 있으면 떼어 낸다(대소문자 무시).
    // resolveProgramFileName 이 'fileName.methodName' 으로 점프 locator 를 만들 때
    // 확장자가 남으면 'X.pc.method' 처럼 끼어 소스 매칭/점프가 깨지기 때문.
    const lower = mapped.toLowerCase();
    const ext = ['.pc', '.c'].find((e) => mapped.length > e.length && lower.endsWith(e));
    const fileNameNoExt = ext ? mapped.slice(0, mapped.length - ext.length) : mapped;
    return { fileName: fileNameNoExt, methodName: key };
  }
}
