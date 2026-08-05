import type { CodeKind } from './discussionService';
import { resolvePbParser, resolvePb5Parser } from './parser';

// file_name 에서 자동 점프할 '이름'을 뽑는다: 마지막 '.' 뒤 조각.
// "메소드냐 파일이냐"를 판정하지 않는다. 실제 파일 확장자(*.java/*.c/*.pc 등)거나
// 점이 없으면(단일 이름) 점프 대상 이름이 없으므로 null.
const CODE_FILE_EXTENSIONS = new Set(['java', 'c', 'pc', 'h', 'cpp', 'hpp', 'cs', 'js', 'ts']);

export const extractJumpName = (fileName: string | null | undefined): string | null => {
  if (!fileName) return null;
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  // 점이 없거나(단일 이름) 맨 앞/뒤에 위치하면 점프 이름이 아니다.
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return null;
  const lastSegment = trimmed.slice(lastDot + 1);
  if (CODE_FILE_EXTENSIONS.has(lastSegment.toLowerCase())) return null; // 진짜 파일 확장자
  // 'doLogin()' / 'doLogin(String id)' 처럼 괄호가 붙어와도 이름만 남긴다.
  const jumpName = lastSegment.replace(/\s*\(.*\)\s*$/, '').trim();
  return jumpName || null;
};

// 대분류(big_category)에 맞는 parser(src/parser)로 file_name(프로그램ID)을 실제 파일명으로 도출한다.
//   - 전담 parser('서비스' 등): 변환된 '맨이름'에 확장자를 부여한다. pb → '.pc', pb5 → '.java'.
//       예) '서비스' → pb: '<id>_APS.pc' / pb5: '<id>Service.java'
//   - Pb5/PbDefaultParser(fallback): file_name 을 가공 없이 그대로 쓴다(확장자/메소드 형태 보존).
//   - pb/pb5 가 'Class.method'(메소드 단위)면 확장자를 붙이지 않고 그대로 둔다.
//       다운스트림 extractJumpName 이 '.method' 를 자동 점프 이름으로 처리하기 때문.
//   - file_name 이 비면 DB 값을 그대로 쓴다.
const CODE_EXT_BY_KIND: Record<CodeKind, string> = { pb: 'pc', pb5: 'java' };

// 확장자 부여: 점 없는 '맨이름'(예: <id>Service / <id>Impl / <id>_APS)에만 kind 확장자를 붙인다.
// 점이 있으면 그대로 둔다 → 실제 확장자(.java/.pc)는 살리고(중복 방지),
// 'Class.method' 메소드 locator 는 확장자를 붙이면 매칭/점프가 깨지므로 보존한다.
const withCodeExt = (name: string, kind: CodeKind): string =>
  name.includes('.') ? name : `${name}.${CODE_EXT_BY_KIND[kind]}`;

export const resolveProgramFileName = (
  kind: CodeKind,
  bigCategory: string | null | undefined,
  storedFileName: string | null | undefined,
): string | null => {
  const base = storedFileName?.trim();
  if (!base) return storedFileName ?? null;

  if (kind === 'pb') {
    const target = resolvePbParser(bigCategory, base)?.parse(base);
    if (!target) return storedFileName ?? null;
    // 메소드 단위 매칭('Class.method')은 확장자 미부여로 점프 locator 보존 (pb5 분기와 대칭).
    if (target.methodName) return `${target.fileName}.${target.methodName}`;
    // pb 소스는 .pc 로 끝나게: 이미 .pc(또는 .sql 등 확장자)면 그대로, 없으면 .pc 를 붙인다.
    return withCodeExt(target.fileName, 'pb');
  }

  const target = resolvePb5Parser(bigCategory, base)?.parse(base);
  if (!target) return storedFileName ?? null;
  // 메소드 단위 매칭은 'Class.method' 형태를 유지(확장자 미부여) → 점프 locator 보존.
  if (target.methodName) return `${target.className}.${target.methodName}`;
  return withCodeExt(target.className, 'pb5');
};
