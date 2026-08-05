// 처리 리액션(확인중/조치완료/조치불필요) 라벨·색 단일 정의(SSOT). 메시지(댓글) 단위로 설정한다.
import type { ThreadReaction } from '../discussionService';

// 활성/선택 상태 색. 흰 글씨 on 밝은 배경은 대비(WCAG AA) 미달이라, 상태 배지와 동일한
// "연한 배경 + 진한 글씨 + 색 테두리" 규약으로 통일한다(대비 확보 + 배지 스타일 일관성).
export const REACTIONS: { key: ThreadReaction; label: string; activeClass: string }[] = [
  { key: 'REVIEWING', label: '확인중', activeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'DONE', label: '조치 완료', activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { key: 'SKIP', label: '조치 불필요', activeClass: 'bg-slate-200 text-slate-700 border-slate-400' },
];

/** 리액션 코드(또는 null)를 안전하게 메타로 변환한다. 없으면 null. */
export const getReactionMeta = (key?: string | null) =>
  REACTIONS.find((r) => r.key === key) ?? null;
