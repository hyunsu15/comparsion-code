import type { MethodInfo } from './methodTypes';
import { stripCodeForBraces, findBlockEndLine } from './codeScan';

// ── Java/PB5(.java) 메소드 추출 ─────────────────────────────────────────────
// 정규식 한 줄 매칭은 (1)여는 '{' 가 다음 줄에 있거나(Allman) (2)제네릭 반환형에
// 공백이 있거나(Map<String, Integer>) (3)파라미터가 여러 줄이면 놓친다.
// → C 추출기처럼 '시그니처를 이어붙여' 파라미터 ')' 를 찾고, 그 뒤 본문 '{' 가
//   같은 줄/다음 줄 어디에 있든 본문 시작으로 인정한다.

// 메소드명으로 인정하지 않는 키워드(제어문/예약어). 이 토큰이 '(' 앞이면 메소드 아님.
const JAVA_NON_METHOD_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'new', 'do', 'else',
]);

// 어노테이션(@Foo, @Foo(...))을 제거한다 — 시그니처 파싱을 방해하지 않도록.
const stripAnnotations = (line: string): string =>
  line.replace(/@\w+(?:\s*\([^()]*\))?/g, ' ');

// 이어붙인 헤더에서 메소드명을 뽑는다.
//   - 이름 = 첫 '(' 직전의 식별자
//   - 이름 앞에 반환형/수식어 토큰이 최소 1개 있어야 메소드(없으면 호출/제어문/enum 상수)
//     prefix: 반환형/수식어가 윗줄로 줄바꿈된 경우 호출부가 모아 넘긴다(아래 gatherSignaturePrefix).
//   - 'new X()'(익명 클래스), 제어 키워드는 제외
const getJavaMethodName = (header: string, prefix = ''): string | null => {
  const open = header.indexOf('(');
  if (open < 0) return null;
  const before = header.slice(0, open).trim();
  const name = before.match(/([\w$]+)\s*$/)?.[1];
  if (!name || JAVA_NON_METHOD_NAMES.has(name)) return null;

  const beforeName = `${prefix} ${before.slice(0, before.length - name.length)}`.trim();
  if (!beforeName) return null; // 앞에 반환형/수식어 없음 → 호출/제어문/enum 상수 본문
  if (/(^|\W)new$/.test(beforeName)) return null; // new X() { } 익명 클래스
  return name;
};

// 메소드명+'(' 가 한 줄에 있고 그 앞 토큰(반환형/수식어)이 윗줄로 줄바꿈된 경우,
// 윗줄(들)을 모아 prefix 로 돌려준다(예: 'public Map<String, Integer>' 가 윗줄, 'getCounts() {' 가 다음 줄).
// 빈 줄/어노테이션만 있는 줄, 또는 이전 문장/블록/콤마(enum 상수) 경계(`;{},):`)를 만나면 멈춘다.
const SIG_PREFIX_STOP = /[;{},):]$/;
const gatherSignaturePrefix = (lines: string[], startIndex: number): { text: string; startLine: number } => {
  const parts: string[] = [];
  let startLine = startIndex + 1; // 1-base; 못 당기면 '(' 줄
  for (let j = startIndex - 1; j >= 0 && j >= startIndex - 5; j--) {
    const t = stripAnnotations(stripCodeForBraces(lines[j], { inBlockComment: false })).trim();
    if (t === '' || SIG_PREFIX_STOP.test(t)) break;
    parts.unshift(t);
    startLine = j + 1;
  }
  return { text: parts.join(' '), startLine };
};

// 수식어 없는(package-private) 생성자 판별: '(' 앞 토큰 전체가 현재 클래스명과 정확히 같을 때만 인정.
//   - 수식어 있는 생성자(public/private 등)는 getJavaMethodName 가 이미 처리한다.
//   - enum 상수 본문(PLUS("+") {)은 이름≠클래스명이라 제외, new X()·this()/호출은 '(' 앞에 다른 토큰이 있어 제외.
//   - enum 생성자는 관례상 수식어가 없어 이 경로로 인식된다.
const getConstructorName = (header: string, className: string): string | null => {
  if (!className) return null;
  const open = header.indexOf('(');
  if (open < 0) return null;
  return header.slice(0, open).trim() === className ? className : null;
};

// 클래스/인터페이스/enum/record 선언에서 타입명을 뽑는다(생성자 판별용 '현재 클래스명' 추적).
const CLASS_DECL = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;

// 문자열 s 에서 파라미터 괄호 균형을 추적, 닫는 ')'(균형 0 복귀) 컬럼을 찾는다(시그니처 끝 판정).
const scanParenClose = (
  s: string,
  startDepth: number,
  sawBefore: boolean,
): { depth: number; saw: boolean; endCol: number } => {
  let depth = startDepth;
  let saw = sawBefore;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '(') { depth++; saw = true; }
    else if (s[k] === ')') depth--;
    if (saw && depth === 0 && s[k] === ')') return { depth, saw, endCol: k };
  }
  return { depth, saw, endCol: -1 };
};

// i 부터 파라미터 여는 '(' ~ 닫는 ')' 까지 이어붙인다(멀티라인 시그니처, 최대 40줄).
//   반환: 닫는 ')' 줄 index, ')' 뒤 잔여 텍스트, 이어붙인 헤더. 못 찾으면 null.
const findJavaSignatureEnd = (
  lines: string[],
  start: number,
): { endIndex: number; afterParen: string; headerText: string } | null => {
  const parts: string[] = [];
  let depth = 0;
  let saw = false;
  for (let j = start; j < lines.length && j < start + 40; j++) {
    const s = stripAnnotations(stripCodeForBraces(lines[j], { inBlockComment: false }));
    parts.push(s);
    const r = scanParenClose(s, depth, saw);
    depth = r.depth;
    saw = r.saw;
    if (r.endCol >= 0) return { endIndex: j, afterParen: s.slice(r.endCol + 1), headerText: parts.join(' ') };
  }
  return null;
};

// 닫는 ')' 뒤(같은 줄/다음 줄들)에서 본문 '{' 시작 줄을 찾는다. throws 절·빈 줄은 건너뛴다.
//   본문 없으면(추상/인터페이스/메소드 아님) -1.
const findJavaBodyStart = (lines: string[], sigEndIndex: number, afterParen: string): number => {
  let inThrows = false;
  for (let j = sigEndIndex; j < lines.length && j < sigEndIndex + 6; j++) {
    let tail = (j === sigEndIndex ? afterParen : stripCodeForBraces(lines[j], { inBlockComment: false })).trim();
    if (tail === '') continue;
    if (/^throws\b/.test(tail)) inThrows = true;
    if (inThrows) tail = tail.replace(/^throws\b/, '').replace(/^[\w.,\s]+/, '').trim(); // throws 키워드+예외목록 제거
    if (inThrows && tail === '') continue; // throws 목록이 다음 줄로 이어짐
    return tail.startsWith('{') ? j : -1; // '{' 면 본문 시작, 아니면 본문 없는 선언
  }
  return -1;
};

// 이어붙인 헤더에서 메소드명을 도출한다.
//   ① 같은 줄 반환형/수식어 ② 윗줄로 줄바꿈된 반환형(prefix 보강) ③ 수식어 없는 생성자(이름==클래스명, enum 생성자 포함)
const resolveJavaMethodName = (
  lines: string[],
  i: number,
  headerText: string,
  currentClass: string,
): { name: string; startLine: number } | null => {
  const direct = getJavaMethodName(headerText);
  if (direct) return { name: direct, startLine: i + 1 };
  const prefix = gatherSignaturePrefix(lines, i);
  const withPrefix = prefix.text ? getJavaMethodName(headerText, prefix.text) : null;
  if (withPrefix) return { name: withPrefix, startLine: i + 1 };
  // 함수명과 '(' 가 다른 줄이면 헤더가 '(' 로 시작 → prefix 끝 토큰이 함수명. 시작 줄도 윗줄로.
  if (prefix.text && headerText.trimStart().startsWith('(')) {
    const merged = getJavaMethodName(`${prefix.text} ${headerText}`);
    if (merged) return { name: merged, startLine: prefix.startLine };
  }
  const ctor = getConstructorName(headerText, currentClass);
  return ctor ? { name: ctor, startLine: i + 1 } : null;
};

export const extractJavaMethods = (code: string): MethodInfo[] => {
  const lines = code.split('\n');
  const results: MethodInfo[] = [];
  const commentState = { inBlockComment: false };
  let currentClass = '';

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripAnnotations(stripCodeForBraces(lines[i], commentState));
    const classDecl = stripped.match(CLASS_DECL);
    if (classDecl) currentClass = classDecl[1];
    if (!stripped.includes('(')) continue;

    const sig = findJavaSignatureEnd(lines, i);
    if (!sig) continue; // 닫는 ')' 못 찾음 → 메소드 아님
    const bodyStart = findJavaBodyStart(lines, sig.endIndex, sig.afterParen);
    if (bodyStart === -1) continue; // 본문 없음(추상/인터페이스)·메소드 아님

    const resolved = resolveJavaMethodName(lines, i, sig.headerText, currentClass);
    if (!resolved) continue;

    results.push({ name: resolved.name, line: resolved.startLine, endLine: findBlockEndLine(lines, bodyStart) });
    i = bodyStart; // 본문 시작으로 이동(시그니처 줄들을 재탐지하지 않게)
  }

  return results;
};
