import { describe, it, expect } from 'vitest';
import { toggleFavorite, isFavorite } from '../src/favorites';

describe('toggleFavorite — 즐겨찾기 토글(순수)', () => {
  it('없으면 추가(끝에)', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('있으면 제거', () => {
    expect(toggleFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('빈 배열에 추가', () => {
    expect(toggleFavorite([], 'a')).toEqual(['a']);
  });

  it('원본 배열은 변경하지 않는다(복사 반환)', () => {
    const orig = ['a'];
    toggleFavorite(orig, 'b');
    expect(orig).toEqual(['a']);
  });
});

describe('isFavorite', () => {
  it('포함되면 true', () => {
    expect(isFavorite(['a', 'b'], 'a')).toBe(true);
  });

  it('미포함이면 false', () => {
    expect(isFavorite(['a', 'b'], 'c')).toBe(false);
  });

  it('빈 배열은 false', () => {
    expect(isFavorite([], 'a')).toBe(false);
  });
});
