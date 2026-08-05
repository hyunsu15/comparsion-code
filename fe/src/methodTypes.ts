/**
 * 코드에서 추출한 메소드 1개의 위치 정보.
 *   - line    : 메소드 시작 줄(1-base)
 *   - endLine : 블록이 끝나는 줄(접기/점프 범위 계산용)
 */
export interface MethodInfo {
  name: string;
  line: number;
  endLine: number;
}
