// IDE식 코드 내용 검색용 순수 로직.
//  - findMatches  : 코드 전체에서 검색어 위치(줄/열) 목록
//  - findRanges   : 한 줄에서 검색어 구간 목록
//  - buildSearchSegments : Shiki 토큰을 검색 매치 경계로 쪼개 하이라이트 세그먼트로 변환
// (React/DOM 의존 없음 → 단위 테스트 대상)

/** 코드 전체에서의 검색 매치 위치 (line: 1-base, start/end: 줄 내 0-base 열) */
export interface CodeMatch {
  line: number;
  start: number;
  end: number;
}

/** 한 줄 내 검색 구간 */
export interface MatchRange {
  start: number;
  end: number;
}

export type SearchHighlight = 'none' | 'match' | 'active';

/** 하이라이트 렌더용 세그먼트 (토큰 색/스타일 보존 + 매치 표시) */
export interface SearchSegment {
  content: string;
  color?: string;
  fontStyle?: number;
  hl: SearchHighlight;
}

/** 한 줄(text)에서 query 가 나타나는 구간들을 찾는다(겹치지 않게). */
export const findRanges = (
  text: string,
  query: string,
  caseSensitive = false,
): MatchRange[] => {
  const ranges: MatchRange[] = [];
  if (!query) return ranges;
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) break;
    ranges.push({ start: idx, end: idx + needle.length });
    from = idx + needle.length; // 비겹침
  }
  return ranges;
};

/** 코드 전체에서 검색어 매치 위치(줄/열)를 모은다. */
export const findMatches = (
  code: string,
  query: string,
  caseSensitive = false,
): CodeMatch[] => {
  const out: CodeMatch[] = [];
  if (!query) return out;
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const r of findRanges(lines[i], query, caseSensitive)) {
      out.push({ line: i + 1, start: r.start, end: r.end });
    }
  }
  return out;
};

const toPlainSegments = (
  tokens: { content: string; color?: string; fontStyle?: number }[],
): SearchSegment[] =>
  tokens.map((t) => ({ content: t.content, color: t.color, fontStyle: t.fontStyle, hl: 'none' }));

/**
 * 한 줄의 토큰들을 검색 매치 경계로 쪼개 하이라이트 세그먼트로 만든다.
 * 매치가 여러 토큰에 걸쳐도(색 경계와 무관하게) 정확히 표시된다.
 *
 * @param activeStart 이 줄에 '현재(active) 매치'가 있으면 그 시작 열, 없으면 null
 */
export const buildSearchSegments = (
  tokens: { content: string; color?: string; fontStyle?: number }[],
  query: string,
  caseSensitive: boolean,
  activeStart: number | null,
): SearchSegment[] => {
  if (!query) return toPlainSegments(tokens);

  const lineText = tokens.map((t) => t.content).join('');
  const ranges = findRanges(lineText, query, caseSensitive);
  if (ranges.length === 0) return toPlainSegments(tokens);

  const segs: SearchSegment[] = [];
  let pos = 0;
  for (const tok of tokens) {
    const text = tok.content;
    let i = 0;
    while (i < text.length) {
      const abs = pos + i;
      const covering = ranges.find((r) => abs >= r.start && abs < r.end);
      if (covering) {
        const end = Math.min(text.length, covering.end - pos);
        segs.push({
          content: text.slice(i, end),
          color: tok.color,
          fontStyle: tok.fontStyle,
          hl: activeStart !== null && covering.start === activeStart ? 'active' : 'match',
        });
        i = end;
      } else {
        const next = ranges.find((r) => r.start > abs);
        const stop = next ? Math.min(text.length, next.start - pos) : text.length;
        segs.push({
          content: text.slice(i, stop),
          color: tok.color,
          fontStyle: tok.fontStyle,
          hl: 'none',
        });
        i = stop;
      }
    }
    pos += text.length;
  }
  return segs;
};
