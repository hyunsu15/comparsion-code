// 의견 유형(opinion type) 단일 정의(SSOT) — 백엔드 opinion_type 컬럼과 1:1 대응.
// 스레드를 처음 열 때(새 스레드)는 반드시 하나를 선택해야 한다(강제). 답글에는 유형이 없다.
export type OpinionType = 'MISMATCH' | 'OMISSION' | 'EXPLANATION' | 'BUSINESS_CHECK' | 'ETC';

export interface OpinionTypeMeta {
  code: OpinionType;
  label: string; // 한글 표시 라벨
  description: string; // 선택 가이드(부연 설명)
  badgeClass: string; // 배지 색상 (Tailwind)
  dotClass: string; // 필터 점/칩 강조 색
}

export const OPINION_TYPES: OpinionTypeMeta[] = [
  { code: 'MISMATCH', label: '불일치 의심', description: 'Java 로직이 C와 다르게 변환된 것으로 보임', badgeClass: 'bg-rose-100 text-rose-700', dotClass: 'bg-rose-500' },
  { code: 'OMISSION', label: '누락 의심', description: '특정 로직·조건·SQL·메시지 등이 빠진 것 같음', badgeClass: 'bg-amber-100 text-amber-700', dotClass: 'bg-amber-500' },
  { code: 'EXPLANATION', label: '설명 요청', description: '왜 이런 식으로 변환했는지 부연 설명 요청', badgeClass: 'bg-blue-100 text-blue-700', dotClass: 'bg-blue-500' },
  { code: 'BUSINESS_CHECK', label: '업무 확인 필요', description: '소스만으로 판단이 어려움', badgeClass: 'bg-violet-100 text-violet-700', dotClass: 'bg-violet-500' },
  { code: 'ETC', label: '기타', description: '기타 의견', badgeClass: 'bg-slate-200 text-slate-600', dotClass: 'bg-slate-400' },
];

/** 코드(또는 null/구버전 값)를 안전하게 메타로 변환한다. 없으면 null. */
export const getOpinionMeta = (code?: string | null): OpinionTypeMeta | null =>
  OPINION_TYPES.find((t) => t.code === code) ?? null;
