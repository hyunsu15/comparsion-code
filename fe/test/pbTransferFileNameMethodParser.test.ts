import { describe, it, expect } from 'vitest';
import { PbTransferFileNameMethodParser } from '../src/parser/pbTransferFileNameMethodParser';

// transferFileNameMethodMap 이 비어 있어 parse 내부에서 mapped = 입력값으로 폴백된다.
// 따라서 입력값으로 '.pc/.c 접미사 제거' 분기를 그대로 검증할 수 있다.
describe('PbTransferFileNameMethodParser.parse — .pc / .c 접미사 제거', () => {
  const parser = new PbTransferFileNameMethodParser();

  it('mapped 끝에 .pc 가 있으면 fileName 에서 제거한다', () => {
    expect(parser.parse('ACCT001Transfer.pc').fileName).toBe('ACCT001Transfer');
  });

  it('mapped 끝에 .c 가 있으면 fileName 에서 제거한다', () => {
    expect(parser.parse('ACCT001Transfer.c').fileName).toBe('ACCT001Transfer');
  });

  it('확장자가 없으면 그대로 둔다', () => {
    expect(parser.parse('ACCT001Transfer').fileName).toBe('ACCT001Transfer');
  });

  it('대소문자를 무시한다(.PC / .C 도 제거)', () => {
    expect(parser.parse('Foo.PC').fileName).toBe('Foo');
    expect(parser.parse('Foo.C').fileName).toBe('Foo');
  });

  it('접미사가 아니면(중간/이름 일부) 제거하지 않는다', () => {
    expect(parser.parse('pcReport').fileName).toBe('pcReport'); // 'pc'로 시작
    expect(parser.parse('calc').fileName).toBe('calc'); // 'c'로 끝나지만 '.c' 아님
    expect(parser.parse('a.pc.b').fileName).toBe('a.pc.b'); // '.pc'가 중간
  });

  it('methodName 은 입력 file_name(트림)을 유지한다', () => {
    expect(parser.parse('  doTransfer  ').methodName).toBe('doTransfer');
  });

  it('supports: 맵에 없는 file_name 은 담당하지 않는다(빈 맵)', () => {
    expect(parser.supports(null, 'ACCT001')).toBe(false);
  });
});
