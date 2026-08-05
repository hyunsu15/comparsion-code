import { describe, it, expect } from 'vitest';
import { findMatches, findRanges, buildSearchSegments } from '../src/codeview/codeSearch';

describe('findRanges (한 줄 검색)', () => {
  it('모든 매치 구간을 겹치지 않게 찾는다', () => {
    expect(findRanges('abcabc', 'bc')).toEqual([{ start: 1, end: 3 }, { start: 4, end: 6 }]);
  });
  it('기본은 대소문자 무시', () => {
    expect(findRanges('AbC', 'abc')).toEqual([{ start: 0, end: 3 }]);
  });
  it('대소문자 구분 옵션', () => {
    expect(findRanges('AbC', 'abc', true)).toEqual([]);
  });
  it('빈 검색어는 매치 없음', () => {
    expect(findRanges('abc', '')).toEqual([]);
  });
  it('인접 매치도 각각 잡는다', () => {
    expect(findRanges('aaa', 'a')).toEqual([{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]);
  });
});

describe('findMatches (코드 전체 검색)', () => {
  it('여러 줄의 줄/열 위치를 반환', () => {
    const code = 'foo bar\nbaz foo';
    expect(findMatches(code, 'foo')).toEqual([
      { line: 1, start: 0, end: 3 },
      { line: 2, start: 4, end: 7 },
    ]);
  });
  it('빈 검색어는 빈 배열', () => {
    expect(findMatches('foo', '')).toEqual([]);
  });
  it('대소문자 구분 시 정확히 일치하는 것만', () => {
    expect(findMatches('Foo\nfoo', 'foo', true)).toEqual([{ line: 2, start: 0, end: 3 }]);
  });
});

describe('buildSearchSegments (토큰 하이라이트 분할)', () => {
  const tokens = [
    { content: 'const ', color: '#1', fontStyle: 0 },
    { content: 'acct', color: '#2', fontStyle: 1 },
    { content: ' = 1', color: '#3', fontStyle: 0 },
  ];

  it('검색어가 없으면 원본 텍스트/none 유지', () => {
    const segs = buildSearchSegments(tokens, '', false, null);
    expect(segs.map((s) => s.content).join('')).toBe('const acct = 1');
    expect(segs.every((s) => s.hl === 'none')).toBe(true);
  });

  it('토큰 경계를 가로지르는 매치도 정확히 표시(텍스트 보존)', () => {
    const segs = buildSearchSegments(tokens, 'st a', false, null);
    expect(segs.map((s) => s.content).join('')).toBe('const acct = 1'); // 원문 보존
    expect(segs.filter((s) => s.hl === 'match').map((s) => s.content).join('')).toBe('st a');
  });

  it('현재(active) 매치는 hl=active, 토큰 색/스타일 보존', () => {
    const segs = buildSearchSegments(tokens, 'acct', false, 6); // 'acct'는 6열에서 시작
    const active = segs.filter((s) => s.hl === 'active');
    expect(active.map((s) => s.content).join('')).toBe('acct');
    expect(active[0].fontStyle).toBe(1); // 원 토큰 스타일 유지
  });

  it('active가 아니면 매치는 hl=match', () => {
    const segs = buildSearchSegments(tokens, 'acct', false, null);
    expect(segs.some((s) => s.hl === 'match')).toBe(true);
    expect(segs.some((s) => s.hl === 'active')).toBe(false);
  });

  it('매치 없으면 none 유지', () => {
    const segs = buildSearchSegments(tokens, 'zzz', false, null);
    expect(segs.every((s) => s.hl === 'none')).toBe(true);
  });
});
