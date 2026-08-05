import type { ResolveStatus } from '../Link';

// 소스 매칭 실패를 '디버깅 가능한' 사유 메시지로 변환한다. (성공이면 null)
// "비교할 소스를 선택하세요" 같은 모호한 문구 대신, 어느 측의 어떤 file_name 이
// 어디서 매칭 실패했는지를 알려 준다.
export const describeResolveFailure = (
  label: 'PB' | 'PB5',
  fileName: string | null | undefined,
  status: ResolveStatus,
  searchPath: string,
): string | null => {
  if (status === 'ok') return null;
  if (status === 'empty-name') {
    return `${label} 소스가 등록되어 있지 않습니다. (DB services.file_name 이 비어 있음)`;
  }
  // not-found: file_name 은 있으나 매칭되는 파일이 없음
  return (
    `${label} 소스 파일을 찾지 못했습니다: file_name="${fileName ?? ''}" — ${searchPath} 에서 매칭 실패. ` +
    `확인: ① 파일이 해당 경로에 있는지 ② file_name 이 파일명/프로그램ID(또는 Class.method, _APS 접미사 포함/제외)와 일치하는지.`
  );
};

// 표시용 날짜/시각 포맷(YYYY-MM-DD HH:MM:SS). 파싱 불가하면 원본을 문자열로 그대로 반환.
export const formatDateTime = (dateInput: string | number | Date) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// 팝오버 표시 위치 — 클릭 좌표에서 살짝 왼쪽/위로 당겨 커서를 가리지 않게 한다.
export const getSmartPosition = (clientX: number, clientY: number) => {
  return { x: clientX - 160, y: clientY - 100 };
};
