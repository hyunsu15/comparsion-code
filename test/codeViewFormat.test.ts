import { describe, it, expect } from 'vitest';
import { describeResolveFailure, formatDateTime, getSmartPosition } from '../src/codeview/codeViewFormat';
import { getErrorMessage } from '../src/errorMessage';

describe('describeResolveFailure', () => {
  it("status 'ok' 이면 null(사유 없음)", () => {
    expect(describeResolveFailure('PB', 'a.pc', 'ok', '/code')).toBeNull();
  });
  it("'empty-name' 이면 등록 안 됨 안내(라벨 포함)", () => {
    const msg = describeResolveFailure('PB5', null, 'empty-name', '/code');
    expect(msg).toContain('PB5');
    expect(msg).toContain('비어');
  });
  it("'not-found' 이면 file_name·검색경로를 담은 진단 메시지", () => {
    const msg = describeResolveFailure('PB', 'EMP.pc', 'not-found', '/code/c');
    expect(msg).toContain('file_name="EMP.pc"');
    expect(msg).toContain('/code/c');
  });
  it('not-found 에서 fileName 이 null 이면 빈 문자열로 표기', () => {
    expect(describeResolveFailure('PB', null, 'not-found', '/x')).toContain('file_name=""');
  });
});

describe('formatDateTime', () => {
  it('유효한 날짜를 YYYY-MM-DD HH:MM:SS 로 (로컬 시각, 0 패딩)', () => {
    // 로컬 구성요소로 만든 Date → 로컬 getter 로 읽으므로 타임존 무관하게 결정적.
    const d = new Date(2023, 0, 5, 9, 3, 7); // 2023-01-05 09:03:07 (local)
    expect(formatDateTime(d)).toBe('2023-01-05 09:03:07');
  });
  it('파싱 불가한 입력은 원본을 문자열로 그대로', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('getSmartPosition', () => {
  it('클릭 좌표에서 x-160, y-100 만큼 당긴다', () => {
    expect(getSmartPosition(200, 300)).toEqual({ x: 40, y: 200 });
  });
});

describe('getErrorMessage', () => {
  it('Error 는 message 를 반환', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });
  it('Error 가 아니면 String() 변환', () => {
    expect(getErrorMessage('plain')).toBe('plain');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(42)).toBe('42');
  });
});
