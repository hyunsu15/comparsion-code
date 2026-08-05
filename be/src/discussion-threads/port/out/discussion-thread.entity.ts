// 조회(findAll/findOne) 시 반환되는 스레드 '뷰'.
// 저장 테이블에는 본문/작성자가 없고(A 포맷), content·writerRole·writerName 은
// 스레드의 '첫 메시지'에서 JOIN 해 합쳐온 값이다 (B 뷰).
export class DiscussionThread {
  id: number;
  status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
  lastReaction: 'REVIEWING' | 'DONE' | 'SKIP' | null; // 마지막 리액션 — 리액션 달린 메시지 중 가장 최근(id max)의 reaction 에서 파생(읽기 전용)
  opinionType: 'MISMATCH' | 'OMISSION' | 'EXPLANATION' | 'BUSINESS_CHECK' | 'ETC' | null; // 의견 유형. 스레드 생성 시 필수(구버전/빈값 호환 위해 null 허용)
  codeKind: 'pb' | 'pb5';
  serviceId: string;
  location: number;
  resolvedAt: Date | null;
  createdAt: Date;
  // ↓ 첫 메시지에서 합쳐온 값 (스레드 본문)
  writerRole: 'pb' | 'pb5';
  writerName: string;
  content: string;
}
