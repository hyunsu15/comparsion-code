// 예외 값을 사용자 표시용 문자열로 변환한다. Error 면 message, 아니면 String(x).
// (checklist/discussion/codeview 세 곳에 중복돼 있던 것을 공유로 통합)
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
