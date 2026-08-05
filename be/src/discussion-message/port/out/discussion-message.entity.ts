export class DiscussionMessage {
  id: number;
  threadId: number;
  writerRole: 'pb' | 'pb5'; // 작성자 측/역할 (작성자 식별이 아님)
  writerName: string;
  content: string;
  reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null; // 처리 리액션 (댓글마다, NULL=미설정)
  createdAt: Date;
}
