import { getOpinionMeta, type OpinionType } from './config/opinionType';

// 백엔드 API base URL — Vite env(.env.development 등)로 관리. 미설정 시 로컬 기본값 사용.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:50004';

export type CodeKind = 'pb' | 'pb5';

export type ThreadReaction = 'REVIEWING' | 'DONE' | 'SKIP';

export interface DiscussionThread {
  id: number;
  service_id: string;
  line_number: number;
  code_kind: CodeKind; // 댓글이 달린 코드 종류 (pb=왼쪽, pb5=오른쪽)
  status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
  last_reaction?: ThreadReaction | null; // 마지막 리액션 — 메시지에서 파생(읽기 전용). status 와 별개 축
  opinion_type?: OpinionType | null; // 의견 유형(불일치/누락/설명/업무확인/기타). 스레드 단위, 생성 시 필수
  content?: string;
  writer_role?: string; // 작성자 측/역할 (첫 메시지에서 합쳐온 값)
  writer_name?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface DiscussionMessage {
  id: number;
  writer_role: string; // backend: writer_role (작성자 측/역할)
  writer_name?: string; // backend: writer_name
  content: string;
  reaction?: ThreadReaction | null; // 처리 리액션(확인중/조치완료/조치불필요). 댓글마다
  created_at: string; // backend: created_at
}

export interface ServiceInfo {
  service_id: string; // 프로그램명 (소분류 역할: 비교 대상을 고르는 말단 키)
  big_category: string | null; // 분류
  middle_category: string | null; // 업무
  code_kind: CodeKind; // pb=왼쪽 소스, pb5=오른쪽 소스
  file_name: string | null;
}

// 백엔드 응답 행 계약(repository/mock 이 camelCase 별칭으로 내려주는 형태). any 대신 이 타입으로 매핑한다.
interface ThreadApiRow {
  id: number;
  serviceId: string;
  location?: number | null;
  codeKind?: string | null;
  status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
  lastReaction?: string | null;
  opinionType?: string | null;
  content?: string | null;
  writerRole?: string | null;
  writerName?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
}

interface ServiceApiRow {
  serviceId: string;
  bigCategory?: string | null;
  middleCategory?: string | null;
  codeKind?: string | null;
  fileName?: string | null;
}

interface MessageApiRow {
  id: number;
  writerRole?: string | null;
  writerName?: string | null;
  content: string;
  reaction?: string | null;
  createdAt?: string | null;
}

// 미지/구버전 값을 안전하게 좁힌다 — as 캐스팅으로 허용되지 않은 유령 값을 흘리지 않는다.
const REACTION_VALUES: readonly ThreadReaction[] = ['REVIEWING', 'DONE', 'SKIP'];
const toCodeKind = (v: unknown, fallback: CodeKind = 'pb5'): CodeKind =>
  v === 'pb' || v === 'pb5' ? v : fallback;
const toReaction = (v: unknown): ThreadReaction | null =>
  (REACTION_VALUES as readonly string[]).includes(v as string) ? (v as ThreadReaction) : null;

// 백엔드 thread 행(camelCase) → UI DiscussionThread(snake_case) 매핑. getThreads/getThreadsPaged 공용.
const mapThread = (item: ThreadApiRow): DiscussionThread => ({
  id: item.id,
  service_id: item.serviceId,
  line_number: item.location || 0, // location 필드를 줄 번호로 사용
  code_kind: toCodeKind(item.codeKind), // 구버전 데이터 호환: 없거나 미지 값이면 pb5
  status: item.status,
  last_reaction: toReaction(item.lastReaction),
  opinion_type: getOpinionMeta(item.opinionType)?.code ?? null,
  content: item.content ?? undefined,
  writer_role: item.writerRole ?? undefined,
  writer_name: item.writerName ?? undefined,
  created_at: item.createdAt ?? undefined,
  resolved_at: item.resolvedAt ?? undefined,
});

export const discussionService = {
  /**
   * 전체 서비스(비교 대상) 메타 목록을 가져옵니다.
   */
  async getServices(): Promise<ServiceInfo[]> {
    const response = await fetch(`${BASE_URL}/services`);
    if (!response.ok) {
      throw new Error(`Failed to fetch services: ${response.statusText}`);
    }
    const data = (await response.json()) as ServiceApiRow[];
    return data.map((item) => ({
      service_id: item.serviceId,
      big_category: item.bigCategory ?? null,
      middle_category: item.middleCategory ?? null,
      code_kind: toCodeKind(item.codeKind, 'pb'), // 서비스 목록은 미지 값 시 pb 로 폴백(기존 동작 유지)
      file_name: item.fileName ?? null,
    }));
  },

  /**
   * 특정 서비스의 모든 토론 스레드를 가져옵니다.
   */
  async getThreads(serviceId: string, status?: 'OPEN' | 'RESOLVED' | 'ALL'): Promise<DiscussionThread[]> {
    // status 기본(OPEN)은 쿼리 생략 → 기존 요청과 동일(하위호환). 완료/전체만 명시 전달.
    const qs = status && status !== 'OPEN' ? `?status=${status}` : '';
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads${qs}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch threads: ${response.statusText}`);
    }
    const data = (await response.json()) as ThreadApiRow[];

    return data.map(mapThread);
  },

  /**
   * 분류별/글로벌 전체 의견을 페이징해서 가져옵니다.
   * bigCategory/middleCategory 미지정 = 글로벌. opinionType 미지정 = 유형 전체.
   */
  async getThreadsPaged(params: {
    bigCategory?: string;
    middleCategory?: string;
    opinionType?: OpinionType;
    status?: 'OPEN' | 'RESOLVED' | 'ALL';
    mySide?: string; // 작성자 소속(pb/pb5) — 내 담당 '확인 필요'를 우선 정렬(서버 ORDER BY)
    page: number;
    size: number;
  }): Promise<{ items: DiscussionThread[]; page: number; size: number; totalCount: number }> {
    const qs = new URLSearchParams();
    if (params.bigCategory) qs.set('bigCategory', params.bigCategory);
    if (params.middleCategory) qs.set('middleCategory', params.middleCategory);
    if (params.opinionType) qs.set('opinionType', params.opinionType);
    if (params.status && params.status !== 'OPEN') qs.set('status', params.status);
    if (params.mySide) qs.set('mySide', params.mySide);
    qs.set('page', String(params.page));
    qs.set('size', String(params.size));

    const response = await fetch(`${BASE_URL}/discussion-threads?${qs.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch threads: ${response.statusText}`);
    }
    const data = (await response.json()) as { items?: ThreadApiRow[]; page: number; size: number; totalCount: number };
    return {
      items: (data.items ?? []).map(mapThread),
      page: data.page,
      size: data.size,
      totalCount: data.totalCount,
    };
  },

  /**
   * 특정 스레드의 모든 메시지를 가져옵니다.
   */
  async getMessages(serviceId: string, threadId: number): Promise<DiscussionMessage[]> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/messages`);
    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }
    const data = (await response.json()) as MessageApiRow[];

    // 백엔드 필드(camelCase)를 UI 필드(snake_case)로 매핑합니다.
    return data.map((msg) => ({
      id: msg.id,
      writer_role: msg.writerRole ?? '',
      writer_name: msg.writerName ?? undefined,
      content: msg.content,
      reaction: toReaction(msg.reaction),
      // createdAt 누락 시 폴백은 비결정적(new Date/toLocaleString) 대신 빈 문자열 — 순수 매핑 유지(테스트 가능).
      created_at: msg.createdAt ?? '',
    }));
  },

  /**
   * 댓글을 저장합니다. threadId가 없으면 새 스레드를 먼저 생성합니다.
   * @param codeKind 새 스레드를 만들 때 어느 코드(pb/pb5)에 달린 댓글인지 (기존 스레드 답글에는 사용되지 않음)
   * @param opinionType 새 스레드를 만들 때 의견 유형(필수). 답글에는 사용되지 않음
   */
  async saveComment(
    serviceId: string,
    line: number,
    content: string,
    writerRole: string,
    writerName: string,
    codeKind: CodeKind,
    opinionType?: OpinionType,
    threadId?: number
  ): Promise<void> {
    const targetThreadId = threadId;
    // 1. threadId가 없으면 새 스레드 생성
    if (!targetThreadId) {
      const threadResponse = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // serviceId는 URL Param으로 들어가므로 Body에서는 생략 가능하거나 DTO에 따라 포함
          location: line, // 줄 번호
          content: content, // 글 내용
          writerRole: writerRole,
          writerName: writerName,
          codeKind: codeKind,
          opinionType: opinionType, // 의견 유형 (새 스레드 생성 시 필수)
        }),
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${threadResponse.statusText}`);
      }
      // 새 스레드를 만들면 작성한 내용이 곧 스레드 본문(첫 메시지)이 되므로 여기서 종료한다.
      return;
    }

    // 2. 해당 스레드에 메시지 추가
    const messageResponse = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${targetThreadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writerRole: writerRole,
        writerName: writerName,
        content,
      }),
    });

    if (!messageResponse.ok) {
      throw new Error(`Failed to save message: ${messageResponse.statusText}`);
    }
  },

  /**
   * 특정 스레드를 종료(해결) 처리합니다.
   */
  async closeThread(serviceId: string, threadId: number): Promise<void> {
    // 컨트롤러의 POST :id/close 엔드포인트를 사용합니다.
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/close`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Failed to close thread: ${response.statusText}`);
    }
  },

  /**
   * 특정 메시지(댓글)의 처리 리액션을 설정/해제합니다. (확인중/조치완료/조치불필요, null=해제)
   * 스레드 제목의 '마지막 리액션'은 백엔드에서 메시지 리액션으로부터 파생된다.
   */
  async updateReaction(serviceId: string, threadId: number, messageId: number, reaction: ThreadReaction | null): Promise<void> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/messages/${messageId}/reaction`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update reaction: ${response.statusText}`);
    }
  },

  /**
   * 특정 메시지(의견/답글)의 내용을 수정합니다.
   * 백엔드는 writerRole(작성자 소속)이 원본 메시지와 일치할 때만 수정을 허용합니다.
   */
  async updateMessage(serviceId: string, threadId: number, messageId: number, content: string, writerRole: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, writerRole }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update message: ${response.statusText}`);
    }
  },

  /**
   * 특정 메시지(의견/답글)를 삭제합니다.
   */
  async deleteMessage(serviceId: string, threadId: number, messageId: number): Promise<void> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/messages/${messageId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.statusText}`);
    }
  },

  /**
   * 스레드를 삭제합니다. (마지막 남은 의견을 지울 때 빈 스레드를 남기지 않도록 사용)
   * 백엔드에서 스레드 삭제 시 메시지는 FK CASCADE 로 함께 삭제됩니다.
   */
  async deleteThread(serviceId: string, threadId: number): Promise<void> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete thread: ${response.statusText}`);
    }
  },
};
