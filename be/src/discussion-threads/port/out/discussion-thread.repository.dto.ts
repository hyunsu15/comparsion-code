export interface CreateDiscussionThreadRepositoryDto {
  // 스레드(메타데이터) 컬럼
  status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
  opinionType: 'MISMATCH' | 'OMISSION' | 'EXPLANATION' | 'BUSINESS_CHECK' | 'ETC'; // 의견 유형 (스레드 생성 시 필수)
  codeKind: 'pb' | 'pb5';
  location: number;
  // 첫 메시지(오프닝)로 함께 저장되는 값 — 스레드 본문
  writerRole: string;
  writerName: string;
  content: string;
}

export interface UpdateDiscussionThreadRepositoryDto {
  // 스레드는 본문이 없으므로 상태만 갱신한다 (본문 수정은 message 쪽).
  status?: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
}
