import { describe, it, expect } from 'vitest';
import { sortThreadsForBoard } from '../src/discussion/commentSort';
import type { DiscussionThread } from '../src/discussionService';

const t = (
  id: number,
  status: DiscussionThread['status'],
  line: number,
): DiscussionThread => ({ id, service_id: 'a', line_number: line, code_kind: 'pb', status });

describe('sortThreadsForBoard — 미해결 먼저, 그 안에서 줄번호순', () => {
  it('미해결(CHECK_*)이 해결(RESOLVED)보다 먼저', () => {
    const got = sortThreadsForBoard([t(1, 'RESOLVED', 5), t(2, 'CHECK_PB', 9)]);
    expect(got.map((x) => x.id)).toEqual([2, 1]);
  });

  it('같은 그룹은 줄번호 오름차순', () => {
    const got = sortThreadsForBoard([t(1, 'CHECK_PB', 30), t(2, 'CHECK_PB5', 10)]);
    expect(got.map((x) => x.id)).toEqual([2, 1]);
  });

  it('미해결(줄순) 후 해결(줄순)', () => {
    const got = sortThreadsForBoard([
      t(1, 'RESOLVED', 3),
      t(2, 'CHECK_PB', 20),
      t(3, 'RESOLVED', 1),
      t(4, 'CHECK_PB5', 5),
    ]);
    // 미해결: line5(4), line20(2) → 해결: line1(3), line3(1)
    expect(got.map((x) => x.id)).toEqual([4, 2, 3, 1]);
  });

  it('원본 배열은 변경하지 않는다(복사 반환)', () => {
    const input = [t(1, 'RESOLVED', 5), t(2, 'CHECK_PB', 9)];
    sortThreadsForBoard(input);
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });

  it('빈 배열은 빈 배열', () => {
    expect(sortThreadsForBoard([])).toEqual([]);
  });
});
