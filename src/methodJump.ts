// 메소드 추출/매칭/파일명 도출 기능의 공개 진입점(barrel).
// 실제 구현은 관심사별 모듈로 분리했고, 여기서 기존 공개 API 를 그대로 re-export 한다.
//   - methodTypes         : MethodInfo
//   - methodMatch         : 이름 매칭(matchRank/findCorrespondingMethod/findMethodByName)
//   - programFileName     : 파일명 도출(extractJumpName/resolveProgramFileName)
//   - cMethodExtractor    : C/PB 함수 추출(extractCMethods)
//   - javaMethodExtractor : Java/PB5 메소드 추출(extractJavaMethods)
//   - codeScan            : (내부) C/Java 가 공유하는 저수준 스캔 헬퍼
import type { MethodInfo } from './methodTypes';
import { extractCMethods } from './cMethodExtractor';
import { extractJavaMethods } from './javaMethodExtractor';

export type { MethodInfo } from './methodTypes';
export { matchRank, findCorrespondingMethod, findMethodByName } from './methodMatch';
export { extractJumpName, resolveProgramFileName } from './programFileName';
export { extractCMethods } from './cMethodExtractor';
export { extractJavaMethods } from './javaMethodExtractor';

/**
 * 언어별 메소드 목록을 추출한다(접기/점프용).
 * xml/sql 은 대상이 없어 빈 배열.
 */
export const extractMethods = (code: string, lang: string): MethodInfo[] => {
  if (lang === 'xml' || lang === 'sql') return [];
  if (lang === 'java') return extractJavaMethods(code);
  return extractCMethods(code);
};
