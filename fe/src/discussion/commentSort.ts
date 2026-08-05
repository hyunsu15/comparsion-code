import type { DiscussionThread } from '../discussionService';

/**
 * 코멘트 모아보기 정렬:
 *  ① 내 작성자 소속(mySide)이 담당자인 '확인 필요'(CHECK_PB/CHECK_PB5)를 먼저,
 *  ② 그다음 상대 담당자 '확인 필요',
 *  ③ 마지막에 해결(RESOLVED) 등.
 * 같은 그룹 안에서는 줄번호 오름차순. mySide 미지정 시 ②③만 적용(확인필요 → 그 외).
 * 원본은 건드리지 않고 새 배열을 반환한다.
 */
export const sortThreadsForBoard = (threads: DiscussionThread[], mySide?: string): DiscussionThread[] => {
  const myCheck = mySide ? `CHECK_${mySide.toUpperCase()}` : null;
  const rank = (status: DiscussionThread['status']) => {
    if (myCheck && status === myCheck) return 0;
    if (status === 'CHECK_PB' || status === 'CHECK_PB5') return 1;
    return 2;
  };
  return [...threads].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return a.line_number - b.line_number;
  });
};
