const BASE_URL = 'http://localhost:50004';

export interface DiscussionThread {
  id: number;
  service_id: string;
  line_number: number;
  status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED';
  content?: string;
  writer_id?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface DiscussionMessage {
  id: number;
  writer_id: string; // backend: writer_id
  content: string;
  created_at: string; // backend: created_at
}

export const discussionService = {
  /**
   * 특정 서비스의 모든 토론 스레드를 가져옵니다.
   */
  async getThreads(serviceId: string): Promise<DiscussionThread[]> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads`);
    if (!response.ok) {
      throw new Error(`Failed to fetch threads: ${response.statusText}`);
    }
    const data = await response.json();
    
    // 백엔드 데이터를 UI에서 기대하는 DiscussionThread 구조로 매핑합니다.
    return data.map((item: any) => ({
        id: item.id,
        service_id: item.service_id,
        line_number: item.location || 0, // location 필드를 줄 번호로 사용
        status: item.status,
        content: item.content,
        writer_id: item.writer_id,
        created_at: item.created_at,
        resolved_at: item.resolved_at,
      }));
  },

  /**
   * 특정 스레드의 모든 메시지를 가져옵니다.
   */
  async getMessages(serviceId: string, threadId: number): Promise<DiscussionMessage[]> {
    const response = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${threadId}/messages`);
    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }
    const data = await response.json();

    // 백엔드 필드(camelCase)를 UI 필드(snake_case)로 매핑합니다.
    return data.map((msg: any) => ({
      id: msg.id,
      writer_id: msg.writer_id,
      content: msg.content,
      // 백엔드에서 생성일시를 제공하지 않을 경우를 대비한 대체값입니다.
      created_at: msg.created_at || new Date().toLocaleString(),
    }));
  },

  /**
   * 댓글을 저장합니다. threadId가 없으면 새 스레드를 먼저 생성합니다.
   */
  async saveComment(
    serviceId: string,
    line: number,
    content: string,
    writerId: string,
    threadId?: number
  ): Promise<void> {
    let targetThreadId = threadId;
    console.log(writerId, content, line, threadId);
    // 1. threadId가 없으면 새 스레드 생성
    if (!targetThreadId) {
      const threadResponse = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // serviceId는 URL Param으로 들어가므로 Body에서는 생략 가능하거나 DTO에 따라 포함
          location: line, // 줄 번호
          content: content, // 글 내용
          writer_id: writerId,
        }),
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${threadResponse.statusText}`);
      }
      const newThread = await threadResponse.json();
      // 백엔드에서 생성된 객체를 반환하므로 id를 추출합니다.
      targetThreadId = newThread.id;
      return ;
    }

    // 2. 해당 스레드에 메시지 추가
    const messageResponse = await fetch(`${BASE_URL}/services/${encodeURIComponent(serviceId)}/discussion-threads/${targetThreadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writer_id: writerId,
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
};