import type { DiscussionThread } from '../discussionService';

export interface LineMarkerSummary {
  count: number;
  status: DiscussionThread['status']; // 대표색: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED'
}

/**
 * 한 줄 스레드들의 마커 요약(개수 + 대표 상태색).
 * 대표색은 미해결 우선: CHECK_PB 있으면 'CHECK_PB', 없고 CHECK_PB5 있으면 'CHECK_PB5', 전부 해결이면 'RESOLVED'.
 * 빈 배열이면 { count: 0, status: 'RESOLVED' }(중립). 원본 미변경.
 */
export const lineMarkerSummary = (threads: DiscussionThread[]): LineMarkerSummary => {
  const count = threads.length;
  if (threads.some((t) => t.status === 'CHECK_PB')) return { count, status: 'CHECK_PB' };
  if (threads.some((t) => t.status === 'CHECK_PB5')) return { count, status: 'CHECK_PB5' };
  return { count, status: 'RESOLVED' };
};
