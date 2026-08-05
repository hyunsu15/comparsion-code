import { describe, it, expect } from 'vitest';
import { buildThreadMessages } from '../src/discussion/commentThread';
import type { DiscussionThread, DiscussionMessage } from '../src/discussionService';

const thread = (content: string): DiscussionThread => ({
  id: 1,
  service_id: 'a',
  line_number: 10,
  code_kind: 'pb',
  status: 'CHECK_PB',
  content,
});

const msg = (id: number, content: string): DiscussionMessage => ({
  id,
  writer_role: 'pb',
  content,
  created_at: '',
});

describe('buildThreadMessages — 펼친 스레드는 답글만(원본 의견 중복 제거)', () => {
  it('원본 의견과 동일한 첫 메시지는 제외하고 답글만 남긴다', () => {
    const got = buildThreadMessages(thread('첫 토론 주제입니다.'), [
      msg(1, '첫 토론 주제입니다.'), // 백엔드가 내려준 원본 의견 사본 → 제외 대상
      msg(2, '첫 답글'),
      msg(3, '두 번째 답글'),
    ]);
    expect(got.map((m) => m.content)).toEqual(['첫 답글', '두 번째 답글']);
  });

  it('원본 의견 사본이 없으면 모든 답글을 유지한다', () => {
    const got = buildThreadMessages(thread('의견 본문'), [msg(1, '답글 A'), msg(2, '답글 B')]);
    expect(got).toHaveLength(2);
  });

  it('답글이 없으면 빈 배열', () => {
    expect(buildThreadMessages(thread('의견'), [])).toEqual([]);
  });

  it('본문과 같은 메시지가 여러 개여도 모두 제외한다', () => {
    const got = buildThreadMessages(thread('중복'), [
      msg(1, '중복'),
      msg(2, '진짜 답글'),
      msg(3, '중복'),
    ]);
    expect(got.map((m) => m.content)).toEqual(['진짜 답글']);
  });
});
