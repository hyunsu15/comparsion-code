import type { DiscussionThread, DiscussionMessage } from '../discussionService';

/**
 * 스레드의 최초 의견(오프닝) 메시지를 고른다.
 * 오프닝 = 가장 먼저 작성된 글 = id 최소값(백엔드 THREAD_VIEW 의 'MIN(id)' 정의와 동일).
 * created_at 은 초 단위(DATE)라 동시각 답글끼리 순서가 흔들릴 수 있어 인덱스(0)가 아닌 id 로 판별한다.
 */
export const getRootMessage = (
  messages: DiscussionMessage[],
): DiscussionMessage | null =>
  messages.length ? messages.reduce((min, m) => (m.id < min.id ? m : min), messages[0]) : null;

/**
 * 펼친 스레드에 보여줄 메시지 목록을 만든다.
 * 원본 의견은 카드 제목에 이미 노출되므로, 펼친 영역에는 답글만 남겨 중복 표시를 막는다.
 * 오프닝은 '내용 일치'가 아니라 '오프닝 메시지 id'로 한 건만 제외한다 — 답글이 오프닝과
 * 같은 문장이어도 사라지지 않도록(내용 비교 방식의 답글 누락 버그 수정).
 */
export const buildThreadMessages = (
  _thread: DiscussionThread,
  replies: DiscussionMessage[],
): DiscussionMessage[] => {
  const root = getRootMessage(replies);
  return root ? replies.filter((m) => m.id !== root.id) : replies;
};
