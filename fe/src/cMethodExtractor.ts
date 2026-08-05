import type { MethodInfo } from './methodTypes';
import { stripCodeForBraces, findBlockEndLine } from './codeScan';

// ──────────────────────────────────────────────────────────────────────────
// C/PB(.pc/.c/.h) 메소드(함수) 추출 — top-level 함수/구조체 정의를 접기/점프 대상으로 잡는다.
// ──────────────────────────────────────────────────────────────────────────

const NON_METHOD_NAMES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'return',
  'sizeof',
  'case',
  'do',
  // 반환 타입/수식어 키워드 — '(' 앞 마지막 토큰이 이것뿐이면 함수명이 아니다.
  // (함수포인터 반환 'void (*f(..))(..)' 에서 'void' 를 함수명으로 오인하는 것 방지)
  'void',
  'int',
  'char',
  'long',
  'short',
  'float',
  'double',
  'unsigned',
  'signed',
  'const',
  'volatile',
  'static',
  'extern',
  'inline',
  'register',
  'auto',
]);

const getCMethodName = (header: string) => {
  const normalizedHeader = header
    .replace(/\bEXEC\s+SQL\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const openParenIndex = normalizedHeader.indexOf('(');
  // 함수명은 '(' 앞에서만 찾는다. 파라미터 안의 struct/타입(예: 'use(struct Acct *p)')이
  // 함수명 판정에 끼어들면 안 되기 때문.
  const beforeParen =
    openParenIndex >= 0 ? normalizedHeader.slice(0, openParenIndex) : normalizedHeader;

  // 1. 함수: '(' 앞 마지막 식별자가 함수명. (예: 'void use(struct Acct *p)' → 'use')
  if (openParenIndex >= 0) {
    const name = beforeParen.match(/([A-Za-z_]\w*)\s*$/)?.[1];
    if (name && !NON_METHOD_NAMES.has(name)) return name;

    // 1-b. 함수포인터 반환 'T (*name(params))(...)': '(' 앞이 타입뿐이라 위에서 걸러졌고,
    //      '(' 다음이 '*name(' 이면 그 식별자가 함수명이다.
    //      (함수포인터 '파라미터'는 함수명이 먼저 잡혀 여기로 오지 않는다)
    const afterParen = normalizedHeader.slice(openParenIndex + 1).trimStart();
    const fnPtr = afterParen.match(/^\*\s*([A-Za-z_]\w*)\s*\(/);
    if (fnPtr && !NON_METHOD_NAMES.has(fnPtr[1])) return fnPtr[1];
  }

  // 2. 구조체 '정의'(struct 태그 뒤 '{' 가 오는 경우)만 인정. 익명 'typedef struct {…}' 와
  //    변수 선언/초기화('struct Foo bar = {…}')는 제외 — 'struct 이름 {' 패턴을 직접 요구한다.
  if (/\bstruct\b/.test(beforeParen)) {
    return beforeParen.match(/\bstruct\s+([A-Za-z_]\w*)\s*\{/)?.[1] ?? null;
  }

  return null;
};

// 전처리기 조건부(#if/#ifdef/#ifndef/#elif/#else/#endif) 스택을 한 줄로 갱신한다.
//   프레임: counted=이 조건부에서 이미 한 분기를 카운트했나, count=현재 분기를 카운트하나.
//   #if 0 은 죽은 첫 분기, 그 외 첫 분기는 채택, #elif/#else 는 '아직 채택 분기가 없을 때만' 채택.
const applyCondDirective = (
  condStack: Array<{ counted: boolean; count: boolean }>,
  trimmed: string,
): void => {
  const m = /^#\s*(ifdef|ifndef|if|elif|else|endif)\b(.*)$/.exec(trimmed);
  if (!m) return;
  const kind = m[1];
  if (kind === 'endif') { condStack.pop(); return; }
  if (kind === 'if' || kind === 'ifdef' || kind === 'ifndef') {
    const dead = kind === 'if' && /^0+$/.test(m[2].trim()); // #if 0 → 죽은 분기
    condStack.push({ counted: !dead, count: !dead });
    return;
  }
  const f = condStack[condStack.length - 1]; // #elif / #else
  if (!f) return;
  if (f.counted) { f.count = false; return; } // 이미 한 분기 카운트함 → 나머지 스킵
  f.count = true; // 아직 없음 → 이 분기 채택(#if 0 다음의 라이브 #else 등)
  f.counted = true;
};

// 줄별 liveCode[i]: 그 줄에서 함수/구조체 정의를 '탐지할지'. '#' 지시문(+'\' 연속행),
// #if 0 죽은 코드, #ifdef/#else 비채택 분기를 제외한다(매크로·비활성/대체 분기의 정의를 안 잡도록).
const buildLiveCode = (lines: string[]): boolean[] => {
  const liveCode = new Array<boolean>(lines.length).fill(true);
  const condStack: Array<{ counted: boolean; count: boolean }> = [];
  let contPreproc = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const isContinuation = contPreproc;
    const directive = isContinuation || trimmed.startsWith('#');
    contPreproc = directive && /\\\s*$/.test(raw); // '\' 판정은 원본 줄로
    if (!isContinuation) applyCondDirective(condStack, trimmed);
    liveCode[i] = !directive && condStack.every((f) => f.count);
  }
  return liveCode;
};

// 시그니처 시작 줄부터 본문 '{' 또는 프로토타입 ';' 까지 이어붙여 분류한다.
//   foundBody=true → 정의(본문 '{' 가 ';' 보다 먼저). 프로토타입/미발견은 false.
const scanCHeader = (
  stripped: string[],
  start: number,
): { text: string; endIndex: number; foundBody: boolean } => {
  const headerLines: string[] = [];
  for (let j = start; j < stripped.length && j < start + 40; j++) {
    headerLines.push(stripped[j].trim());
    const joined = headerLines.join(' ');
    const bodyIndex = joined.indexOf('{');
    const protoIndex = joined.indexOf(';');
    if (protoIndex >= 0 && (bodyIndex < 0 || protoIndex < bodyIndex)) return { text: joined, endIndex: j, foundBody: false };
    if (bodyIndex >= 0) return { text: joined, endIndex: j, foundBody: true };
  }
  return { text: headerLines.join(' '), endIndex: start, foundBody: false };
};

// i 위치에서 함수/구조체 '정의'를 감지하면 { method, endIndex } 반환, 아니면 null.
// 전역 brace-depth 에 의존하지 않는다 — 검색처럼 '정의 패턴'(시그니처 + 본문 '{', 키워드 아님)으로만
// 판단한다. → 어딘가의 중괄호 어긋남(매크로/멀티라인 문자열/조건부 컴파일 등)이 이후 탐지를 망가뜨리던
// 'depth desync'(처음·끝만 인식, 중간 누락) 버그 클래스를 원천 제거. 호출/제어문은 본문 '{' 없음·키워드로,
// 시그니처 연속 줄은 skipUntil(직전 정의의 헤더 끝)로 걸러진다. C 는 중첩 함수가 없어 본문 안엔 정의가 없다.
// 함수명과 여는 '(' 가 다른 줄일 때, '(' 줄 위쪽에서 함수명/반환형을 모은다.
//   헤더가 '(' 로 시작하면 getCMethodName 이 이름을 못 뽑으므로 윗줄을 prefix 로 합치고,
//   시작 줄(line)도 함수명이 있는 윗줄로 당겨 점프/접기가 자연스럽게 한다.
//   빈 줄·이전 문장/블록 경계(';' '{' '}')·비활성 줄·직전 정의 줄(skipUntil)에서 멈춘다.
const gatherCSignaturePrefix = (
  stripped: string[],
  liveCode: boolean[],
  openLine: number,
  skipUntil: number,
): { text: string; startLine: number } => {
  const parts: string[] = [];
  let startLine = openLine + 1; // 1-base; 못 당기면 '(' 줄
  for (let j = openLine - 1; j >= 0 && j > skipUntil && j >= openLine - 3; j--) {
    if (!liveCode[j]) break;
    const t = stripped[j].trim();
    if (t === '' || /[;{}]$/.test(t)) break;
    parts.unshift(t);
    startLine = j + 1;
  }
  return { text: parts.join(' '), startLine };
};

const detectCFunctionAt = (
  lines: string[],
  stripped: string[],
  liveCode: boolean[],
  i: number,
  skipUntil: number,
): { method: MethodInfo; endIndex: number } | null => {
  if (i <= skipUntil) return null; // 직전 정의의 시그니처 줄은 재탐지 안 함
  if (!liveCode[i]) return null; // 지시문/비활성·비채택 분기 제외
  const line = stripped[i];
  if (!line.includes('(') && !line.includes('struct')) return null;
  const header = scanCHeader(stripped, i);
  if (!header.foundBody) return null; // 본문 '{' 없음(프로토타입·호출) → 정의 아님
  let name = getCMethodName(header.text);
  let startLine = i + 1;
  // 함수명과 '(' 가 다른 줄이면 헤더가 '(' 로 시작해 이름이 비므로 윗줄에서 보강한다.
  if (!name && line.trimStart().startsWith('(')) {
    const prefix = gatherCSignaturePrefix(stripped, liveCode, i, skipUntil);
    if (prefix.text) {
      name = getCMethodName(`${prefix.text} ${header.text}`);
      startLine = prefix.startLine;
    }
  }
  if (!name) return null;
  return { method: { name, line: startLine, endLine: findBlockEndLine(lines, header.endIndex) }, endIndex: header.endIndex };
};

export const extractCMethods = (code: string): MethodInfo[] => {
  const lines = code.split('\n');
  // 주석/문자열 제거(블록주석 상태가 줄 사이로 연속 유지). 이후 탐지는 stripped 로만 한다.
  const commentState = { inBlockComment: false };
  const stripped = lines.map((l) => stripCodeForBraces(l, commentState));
  const liveCode = buildLiveCode(lines);

  const results: MethodInfo[] = [];
  let skipDetectUntil = -1; // 직전 정의의 헤더 끝 줄까지는 재탐지 안 함(멀티라인 시그니처 줄 오인 방지)

  for (let i = 0; i < lines.length; i++) {
    const detected = detectCFunctionAt(lines, stripped, liveCode, i, skipDetectUntil);
    if (!detected) continue;
    results.push(detected.method);
    skipDetectUntil = detected.endIndex; // 본문은 이후 스캔되지만 호출/제어문이라 정의로 잡히지 않음
  }

  return results;
};
