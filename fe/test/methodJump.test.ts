import { describe, it, expect } from 'vitest';
import {
  resolveProgramFileName,
  extractMethods,
  matchRank,
  findCorrespondingMethod,
  findMethodByName,
  extractJumpName,
  type MethodInfo,
} from '../src/methodJump';

describe('resolveProgramFileName (parser 기반 파일명 도출)', () => {
  it("pb5 'xxx'(메소드 단위): EmpProcess.processEmployee → EmpProcessImpl.processEmployee (메소드 보존)", () => {
    expect(resolveProgramFileName('pb5', 'xxx', 'EmpProcess.processEmployee')).toBe('EmpProcessImpl.processEmployee');
  });

  it("pb '서비스': ACCT002 → ACCT002_APS.pc", () => {
    expect(resolveProgramFileName('pb', '서비스', 'ACCT002')).toBe('ACCT002_APS.pc');
  });

  it("pb5 '서비스': ACCT001 → ACCT001Service.java", () => {
    expect(resolveProgramFileName('pb5', '서비스', 'ACCT001')).toBe('ACCT001Service.java');
  });

  it('default(미등록 대분류): 실제 파일명은 그대로 보존', () => {
    expect(resolveProgramFileName('pb', '회원', 'ACCT001.pc')).toBe('ACCT001.pc');
  });

  it('수정 ②와 대칭: pb default 에서 Class.method 형태도 확장자 없이 보존', () => {
    expect(resolveProgramFileName('pb', '회원', 'EmpProcess.processEmployee')).toBe('EmpProcess.processEmployee');
  });

  it('엣지: 빈 file_name 은 그대로', () => {
    expect(resolveProgramFileName('pb', '회원', '')).toBe('');
    expect(resolveProgramFileName('pb', '회원', null)).toBeNull();
  });
});

describe('extractMethods — Java(PB5) 인식 (다양한 스타일)', () => {
  const names = (code: string) => extractMethods(code, 'java').map((m) => m.name);

  it('K&R(여는 중괄호 같은 줄)', () => {
    const code = `public class A {
  public int foo(int x) {
    return x;
  }
  public void bar() {
    foo(1);
  }
}`;
    expect(names(code)).toEqual(['foo', 'bar']);
  });

  it('★Allman(여는 중괄호 다음 줄) — 기존엔 전부 미인식되던 케이스', () => {
    const code = `public class A {
  public int foo(int x)
  {
    return x;
  }
  void bar()
  {
  }
}`;
    expect(names(code)).toEqual(['foo', 'bar']); // package-private bar 포함
  });

  it('★제네릭 반환형(공백/콤마 포함)', () => {
    const code = `public class A {
  public Map<String, Integer> getMap() {
    return null;
  }
  public List<String> getList() {
    return null;
  }
}`;
    expect(names(code)).toEqual(['getMap', 'getList']);
  });

  it('★멀티라인 시그니처(파라미터가 여러 줄)', () => {
    const code = `public class A {
  public void process(
      int a,
      int b) {
    a = b;
  }
}`;
    expect(names(code)).toEqual(['process']);
  });

  it('생성자 + 제네릭 메소드(<T>)', () => {
    const code = `public class A {
  public A(int seed) {
    this.seed = seed;
  }
  public <T> T identity(T x) {
    return x;
  }
}`;
    expect(names(code)).toEqual(['A', 'identity']);
  });

  it('어노테이션이 윗줄에 있어도 인식', () => {
    const code = `public class A {
  @Override
  public String toString() {
    return "";
  }
}`;
    expect(names(code)).toEqual(['toString']);
  });

  it('제어문/호출/new 익명클래스/synchronized 는 메소드로 잡지 않는다', () => {
    const code = `public class A {
  public void run() {
    if (cond) { doStuff(); }
    for (int i = 0; i < n; i++) { calc(i); }
    while (go) { tick(); }
    synchronized (lock) { update(); }
    Runnable r = new Runnable() { };
  }
}`;
    expect(names(code)).toEqual(['run']);
  });

  it('본문 없는 선언(추상/인터페이스 메소드, ;로 끝남)은 제외', () => {
    const code = `public interface I {
  void doIt();
  int compute(int x);
}`;
    expect(names(code)).toEqual([]);
  });
});

describe('extractMethods — C(PB) 인식 & 언어 분기', () => {
  const names = (code: string, lang: string) => extractMethods(code, lang).map((m) => m.name);

  it('C: K&R / Allman 모두 인식', () => {
    const kr = `int foo(int x) {
  return x;
}`;
    const allman = `int foo(int x)
{
  return x;
}
void bar(void)
{
  foo(1);
}`;
    expect(names(kr, 'c')).toEqual(['foo']);
    expect(names(allman, 'c')).toEqual(['foo', 'bar']);
  });

  it('C: 프로토타입(선언만, ;)은 제외하고 정의만', () => {
    const code = `int foo(int x);
int foo(int x) {
  return x;
}`;
    expect(names(code, 'c')).toEqual(['foo']);
  });

  it('★파라미터의 struct 가 함수명을 가로채지 않는다 (use, not Acct)', () => {
    const code = `void fill(int arr[], int n) {
  arr[0] = n;
}
void use(struct Acct *p) {
  p->id = 1;
}`;
    expect(names(code, 'c')).toEqual(['fill', 'use']);
  });

  it('struct 반환 함수도 함수명으로 인식', () => {
    expect(names('struct Acct *get_acct(int id) {\n  return 0;\n}', 'c')).toEqual(['get_acct']);
  });

  it('★#define 매크로는 함수로 잡지 않는다', () => {
    const code = `#define SQUARE(x) ((x) * (x))
int compute(int n) {
  return SQUARE(n);
}`;
    expect(names(code, 'c')).toEqual(['compute']);
  });

  it('익명 typedef struct {…} 는 제외(노이즈 방지)', () => {
    const code = `typedef struct {
  int id;
} Account;
void init(Account *a) {
  a->id = 0;
}`;
    expect(names(code, 'c')).toEqual(['init']);
  });

  it('명명된 struct 정의는 폴드 대상으로 유지', () => {
    expect(names('struct Account {\n  int id;\n};\nvoid init(void) {\n}', 'c')).toEqual(['Account', 'init']);
  });

  it('★여러 줄 함수 헤더 속 블록주석이 닫혀도 이후 함수들을 계속 인식한다 (depth/주석 어긋남 회귀)', () => {
    // 예전 버그: 헤더의 /* */ 가 '건너뛴 줄'에서 닫히면 commentState 가 고착돼
    // 이후 모든 줄이 주석 취급 → depth 고정 → 그 지점부터 탐지가 멈췄다.
    const code = `void foo(int a,   /* 여는 주석이
     다음 줄에서 닫힘 */ int b) {
  x = 1;
}
void bar(void) {
  y = 2;
}
int baz(void) {
  return 0;
}`;
    expect(names(code, 'c')).toEqual(['foo', 'bar', 'baz']);
  });

  it('★여러 줄 헤더가 많아도 각 함수의 여는 { 가 빠짐없이 카운트돼 탐지가 끊기지 않는다', () => {
    // 다중 줄 시그니처를 반복해도 top-level 함수가 전부 잡혀야 한다.
    const fn = (n: number) => `int fn${n}(\n    int a,\n    int b) {\n  return a + b;\n}`;
    const code = Array.from({ length: 30 }, (_, i) => fn(i)).join('\n');
    expect(names(code, 'c')).toEqual(Array.from({ length: 30 }, (_, i) => `fn${i}`));
  });

  it('xml/sql 은 대상 메소드 없음([])', () => {
    expect(names('<root><a/></root>', 'xml')).toEqual([]);
    expect(names('SELECT * FROM t;', 'sql')).toEqual([]);
  });

  it('★시그니처에 주석이 섞여도 인식: /* */ foo() /* */ { }', () => {
    expect(names('/* a */ void foo() /* b */ {\n}', 'c')).toEqual(['foo']);
    expect(names('/* */ doProcess()/* */{}', 'c')).toEqual(['doProcess']);
    expect(names('void bar() /* x */\n/* y */ {\n}', 'c')).toEqual(['bar']);
    expect(names('void baz(/* params */) {\n}', 'c')).toEqual(['baz']);
    expect(names('/* hdr(); { */ void qux() {\n}', 'c')).toEqual(['qux']);
  });

  it("★멀티라인 문자열('\\' 연속)의 불균형 중괄호가 있어도 이후 함수들을 계속 인식한다 (depth 어긋남 회귀)", () => {
    // 버그: '\' 로 이어진 문자열의 닫히지 않은 '{' 가 brace depth 를 고정시켜
    //       그 지점부터 탐지가 멈췄다. C 함수는 컬럼0에서 시작하므로 회복돼야 한다.
    const code = `void a(void) {
    char *s = "start \\
{ no close";
    bar();
}
void b(void) { }
void c(void) { }`;
    expect(names(code, 'c')).toEqual(['a', 'b', 'c']);
  });
});

describe('extractMethods — 코드엔 있는데 인식 안 되던 메소드 누락 버그 (회귀)', () => {
  // 증상: 검색으로는 찾아지는 메소드가 인식 목록엔 안 잡혀 개수가 안 늘고 점프도 안 됨.
  //   원인: Java 는 메소드명 앞 반환형/수식어가 '같은 이어붙인 헤더'에 있어야만 인정 →
  //   (A) 반환형이 윗줄에 줄바꿈되거나 (B) throws 절이 본문 { 앞 다음 줄에 오면 놓쳤다.
  const names = (code: string, lang = 'java') => extractMethods(code, lang).map((m) => m.name);

  it('★(A) Java: 긴 제네릭 반환형이 윗줄, 메소드명+( 가 다음 줄', () => {
    const code = `public class A {
  public Map<String, Integer>
  getCounts() {
    return null;
  }
}`;
    expect(names(code)).toEqual(['getCounts']);
  });

  it('★(A) Java: 수식어만 윗줄, 메소드명+( 다음 줄', () => {
    const code = `public class A {
  private void
  doWork() {
  }
}`;
    expect(names(code)).toEqual(['doWork']);
  });

  it('★(A) Java: 어노테이션 + 반환형이 윗줄, 메소드명 다음 줄', () => {
    const code = `public class A {
  @Override
  public Map<String, Integer>
  getCounts() {
    return null;
  }
}`;
    expect(names(code)).toEqual(['getCounts']);
  });

  it('★(A) Java: 제네릭 메소드 <T> T 가 윗줄, 메소드명 다음 줄', () => {
    const code = `public class A {
  public <T> T
  identity(T x) {
    return x;
  }
}`;
    expect(names(code)).toEqual(['identity']);
  });

  it('★(B) Java: throws 절이 본문 { 앞 다음 줄에 있을 때', () => {
    const code = `public class A {
  public List<String> find(String q)
      throws SQLException {
    return null;
  }
}`;
    expect(names(code)).toEqual(['find']);
  });

  it('★(B) Java: throws 목록이 여러 줄, 그 뒤 본문 {', () => {
    const code = `public class A {
  public void foo()
      throws IOException,
             SQLException {
  }
}`;
    expect(names(code)).toEqual(['foo']);
  });

  it('과탐지 방지: enum 상수 본문(이름() {)은 메소드로 오인하지 않는다', () => {
    const code = `public enum Op {
  PLUS("+") {
    public int apply(int a, int b) {
      return a + b;
    }
  },
  MINUS("-") {
    public int apply(int a, int b) {
      return a - b;
    }
  };
}`;
    // PLUS/MINUS 는 메소드가 아니고, 각 본문의 apply 만 메소드.
    expect(names(code)).toEqual(['apply', 'apply']);
  });

  it('회귀: 기존 정상 케이스(같은 줄 반환형 / throws 동일 줄 / Allman)는 그대로', () => {
    const code = `public class A {
  public int a() { return 1; }
  public int b() throws E { return 2; }
  public int c()
  {
    return 3;
  }
}`;
    expect(names(code)).toEqual(['a', 'b', 'c']);
  });
});

describe('extractMethods — C(PB) 백슬래시(\\) 연속 매크로가 함수 인식을 망가뜨리는 버그 (회귀)', () => {
  // 증상: Pro*C 에 흔한 '#define X(..) \' 멀티라인 매크로의 '연속행'을 코드로 오인 →
  //   매크로 본문 식별자를 함수로 잘못 인식하고, 바로 아래 실제 함수를 통째로 삼켜 누락시킨다.
  const names = (code: string) => extractMethods(code, 'c').map((m) => m.name);

  it('★한 줄 백슬래시 매크로가 바로 아래 함수를 삼키지 않는다', () => {
    const code = `#define DB_EXEC(stmt) \\
    do_exec((stmt), &sqlca)

int insert_acct(char *acct_no) {
    DB_EXEC("INSERT INTO account ...");
    return 0;
}`;
    expect(names(code)).toEqual(['insert_acct']);
  });

  it('★여러 줄 백슬래시 매크로 다음의 함수도 정상 인식한다', () => {
    const code = `#define BUILD_KEY(buf, a, b) \\
    sprintf((buf), "%s-%s", \\
            (a), (b))

void make_acct_key(char *buf) {
    BUILD_KEY(buf, "a", "b");
}`;
    expect(names(code)).toEqual(['make_acct_key']);
  });

  it('회귀: 연속(\\)이 없는 단일 줄 #define 은 기존대로 처리(다음 함수 정상)', () => {
    const code = `#define LOG(m) write_log((m))
void save_acct(void) {
    LOG("saved");
}`;
    expect(names(code)).toEqual(['save_acct']);
  });
});

describe('extractMethods — Java(PB5) 수식어 없는 생성자 누락 버그 (회귀)', () => {
  // 증상: public/private 붙은 생성자는 인식되는데, 수식어 없는(package-private) 생성자는 누락.
  //   특히 enum 생성자는 관례상 수식어 없이 쓰므로 거의 항상 빠진다.
  //   안전장치: 이름 == 현재 클래스명일 때만 생성자로 인정 → enum 상수(이름≠클래스명)는 자연 제외.
  const names = (code: string) => extractMethods(code, 'java').map((m) => m.name);

  it('★수식어 없는(package-private) 생성자도 메소드로 인식한다', () => {
    const code = `public class AcctDto {
  private String acctNo;
  private long balance;

  AcctDto() {
  }

  AcctDto(String acctNo, long balance) {
    this.acctNo = acctNo;
    this.balance = balance;
  }

  public String getAcctNo() {
    return acctNo;
  }
}`;
    expect(names(code)).toEqual(['AcctDto', 'AcctDto', 'getAcctNo']);
  });

  it('★필드 바로 아래(이전 줄이 ;)의 수식어 없는 생성자도 인식한다', () => {
    const code = `public class Money {
  private long amount;
  Money(long amount) {
    this.amount = amount;
  }
}`;
    expect(names(code)).toEqual(['Money']);
  });

  it('★enum 생성자(관례상 수식어 없음)도 인식하고, enum 상수는 메소드로 오인하지 않는다', () => {
    const code = `public enum TxType {
  DEPOSIT, WITHDRAW;

  TxType() {
  }

  public int code() {
    return 0;
  }
}`;
    expect(names(code)).toEqual(['TxType', 'code']);
  });

  it('회귀: 수식어 있는 생성자/제어문/new 익명클래스는 기존대로', () => {
    const code = `public class A {
  public A(int seed) {
    this.seed = seed;
  }
  public void run() {
    Runnable r = new Runnable() { };
    if (cond) { doStuff(); }
  }
}`;
    expect(names(code)).toEqual(['A', 'run']);
  });
});

describe('extractMethods — C(PB) 전처리기 중괄호 desync로 중간 메소드 누락 버그 (회귀)', () => {
  // 증상(사용자 보고): 처음·끝 함수만 인식하고 '중간' 함수들을 통째로 못 잡음(특히 4000줄+).
  //   원인: #if 0 죽은 코드 / #ifdef·#else 분기별 중괄호 수 차이 / 매크로 속 중괄호가
  //   topLevelDepth 를 어긋내고, 들여쓰기된(비-컬럼0) 함수가 그 구간에서 게이트에 막혀 누락.
  const names = (code: string) => extractMethods(code, 'c').map((m) => m.name);
  // 들여쓰기된 함수 묶음(컬럼0 게이트의 구제를 받지 못하는 케이스)
  const fns = (start: number, end: number) =>
    Array.from({ length: end - start }, (_, k) => `    void fn_${start + k}(int x) {\n        foo(x);\n    }`).join('\n');
  const expNames = (n: number) => Array.from({ length: n }, (_, i) => `fn_${i}`);

  it('★#if 0 안의 불균형 중괄호 뒤 들여쓰기 함수들이 누락되지 않는다', () => {
    const code = [
      fns(0, 3),
      '#if 0',
      '    void dead(void) {   /* 닫는 중괄호 없음(죽은 코드) */',
      '#endif',
      fns(3, 9),
    ].join('\n');
    expect(names(code)).toEqual(expNames(9));
  });

  it('★#ifdef/#else 이중 중괄호(닫기 1개) 뒤 들여쓰기 함수들이 누락되지 않는다', () => {
    const code = [
      fns(0, 3),
      '#ifdef WIN32',
      '    void platform(void) {',
      '#else',
      '    void platform(void) {',
      '#endif',
      '        body();',
      '    }',
      fns(3, 9),
    ].join('\n');
    // platform 은 한 번 이상 인식되면 되고(중복 허용), 핵심은 뒤쪽 fn_3~8 이 안 사라지는 것.
    const got = names(code);
    expect(expNames(9).every((n) => got.includes(n))).toBe(true);
  });

  it('★매크로(#define) 속 중괄호가 이후 함수 인식을 깨지 않는다', () => {
    const code = [
      '#define INIT_REC(r) do { (r)->id = 0; } while (0)',
      fns(0, 6),
    ].join('\n');
    expect(names(code)).toEqual(expNames(6));
  });

  it('회귀: 균형 잡힌 #ifdef DEBUG 블록은 정상(함수 정상 인식)', () => {
    const code = [
      '#ifdef DEBUG',
      'void log_it(void) { trace(); }',
      '#endif',
      'void real(void) {',
      '    work();',
      '}',
    ].join('\n');
    expect(names(code)).toEqual(['log_it', 'real']);
  });

  it('★#if 0 ... #else <라이브> ... #endif 의 else(라이브) 함수는 인식한다', () => {
    const code = [
      '#if 0',
      'void old_impl(void) {',
      '    legacy();',
      '#else',
      'void new_impl(void) {',
      '    modern();',
      '}',
      '#endif',
      'void after(void) {',
      '    done();',
      '}',
    ].join('\n');
    const got = names(code);
    expect(got).toContain('new_impl');
    expect(got).toContain('after');
  });
});

describe('extractMethods — C(PB) depth-free 전환: 들여쓰기 함수가 desync에도 안 누락 (회귀)', () => {
  // 전역 brace-depth 의존을 제거 → 어디서 중괄호가 어긋나도(매크로/멀티라인문자열/extern "C"/조건부)
  // 이후 '들여쓰기된' 함수까지 빠짐없이 인식. (검색처럼 '정의 패턴'으로만 판단)
  const names = (code: string) => extractMethods(code, 'c').map((m) => m.name);
  const ind = (i: number) => `    int fn_${i}(int a)\n    {\n        work();\n    }`;
  const allFn = (n: number) => Array.from({ length: n }, (_, i) => `fn_${i}`);

  it('★extern "C" 로 전체를 감싼(=depth>0) 들여쓰기 함수도 전부 인식', () => {
    const code = [
      '#ifdef __cplusplus', 'extern "C" {', '#endif',
      ind(0), ind(1), ind(2),
      '#ifdef __cplusplus', '}', '#endif',
    ].join('\n');
    expect(names(code)).toEqual(allFn(3));
  });

  it('★중간 멀티라인 문자열(역슬래시)의 불균형 중괄호 뒤 들여쓰기 함수도 인식', () => {
    const bs = String.fromCharCode(92);
    const code = [
      ind(0),
      'void noise(void) {', `    char *s = "x ${bs}`, '{ no close";', '}',
      ind(1), ind(2),
    ].join('\n');
    const got = names(code);
    expect(allFn(3).every((n) => got.includes(n))).toBe(true);
  });

  it('과탐지 방지: struct 변수 선언/초기화는 메소드로 잡지 않는다', () => {
    const code = [
      'struct Foo bar;',
      'struct Foo baz = { 1, 2 };',
      'struct Foo {',        // 이건 '정의' → 인식
      '  int id;',
      '};',
      'void use(void) {',
      '}',
    ].join('\n');
    expect(names(code)).toEqual(['Foo', 'use']); // 변수 bar/baz 는 제외, 정의 Foo + 함수 use 만
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 새 점프 매칭 규칙: 1순위 이름 일치, 2순위 특수문자 제외·대소문자 무시 pb⊇pb5 포함.
// (메소드 단위 파싱 기반 점프를 이름 매칭으로 단순화)
// ──────────────────────────────────────────────────────────────────────────
describe('matchRank — pb⊇pb5 이름 매칭 등급(2 일치 > 1 포함 > 0 무)', () => {
  it('정규화 일치는 2 (snake ↔ camel 차이 흡수)', () => {
    expect(matchRank('process_employee', 'processEmployee')).toBe(2);
  });

  it('pb가 pb5를 포함하면 1 (pb⊇pb5)', () => {
    // norm: 'processemployeev2' ⊇ 'processemployee'
    expect(matchRank('process_employee_v2', 'processEmployee')).toBe(1);
  });

  it('역방향(pb⊂pb5)은 0 — 단방향만 인정', () => {
    // norm: pb 'processemployee' 는 pb5 'processemployeeimpl' 를 포함하지 않음
    expect(matchRank('processEmployee', 'processEmployeeImpl')).toBe(0);
  });

  it('서로 무관하면 0', () => {
    expect(matchRank('foo', 'bar')).toBe(0);
  });

  it('빈 정규화는 0 (includes("") 과매칭 방지)', () => {
    expect(matchRank('', 'x')).toBe(0);
    expect(matchRank('___', 'foo')).toBe(0);
    expect(matchRank('foo', '!!!')).toBe(0);
  });
});

describe('findCorrespondingMethod — Alt+클릭 좌우 대응(1순위 일치 > 2순위 pb⊇pb5)', () => {
  const PB5: MethodInfo[] = [
    { name: 'calculateTax', line: 12, endLine: 12 },
    { name: 'calculateBonus', line: 13, endLine: 13 },
    { name: 'processEmployee', line: 30, endLine: 34 },
  ];
  const PB: MethodInfo[] = [
    { name: 'calculate_tax', line: 66, endLine: 68 },
    { name: 'process_employee', line: 92, endLine: 96 },
  ];

  it('pb→pb5: 정규화 일치 우선', () => {
    expect(findCorrespondingMethod(PB5, 'calculate_tax', true)?.name).toBe('calculateTax');
  });

  it('pb→pb5: 일치 없으면 pb⊇pb5 포함으로', () => {
    expect(findCorrespondingMethod(PB5, 'process_employee_v2', true)?.name).toBe('processEmployee');
  });

  it('pb5→pb: 정규화 일치 우선', () => {
    expect(findCorrespondingMethod(PB, 'processEmployee', false)?.name).toBe('process_employee');
  });

  it('pb5→pb: 일치 없으면 pb⊇pb5 포함으로(pb 후보가 pb5명을 포함)', () => {
    const pbCands: MethodInfo[] = [{ name: 'process_employee_record', line: 1, endLine: 2 }];
    expect(findCorrespondingMethod(pbCands, 'processEmployee', false)?.name).toBe('process_employee_record');
  });

  it('포함 후보가 여럿이면 길이차가 가장 작은 것', () => {
    const pb5: MethodInfo[] = [
      { name: 'processEmp', line: 1, endLine: 1 },
      { name: 'processEmployee', line: 2, endLine: 2 },
    ];
    expect(findCorrespondingMethod(pb5, 'process_employee_record', true)?.name).toBe('processEmployee');
  });

  it('skip된 후보는 제외', () => {
    expect(findCorrespondingMethod(PB5, 'calculate_tax', true, m => m.name === 'calculateTax')).toBeNull();
  });

  it('무매칭이면 null (토스트로 안내)', () => {
    expect(findCorrespondingMethod(PB5, 'nonexistent', true)).toBeNull();
  });

  it('빈 정규화 source는 null', () => {
    expect(findCorrespondingMethod(PB5, '___', true)).toBeNull();
  });
});

describe('findMethodByName — 자동 점프(file_name 이름으로 코드에서 찾기)', () => {
  const METHODS: MethodInfo[] = [
    { name: 'process_employee', line: 92, endLine: 96 },
    { name: 'calculate_tax', line: 66, endLine: 68 },
  ];

  it('정규화 일치(camel→snake)로 찾는다', () => {
    expect(findMethodByName(METHODS, 'processEmployee')?.line).toBe(92);
  });

  it('포함관계(양방향)로도 찾는다', () => {
    expect(findMethodByName(METHODS, 'process')?.line).toBe(92); // 'process' ⊂ 'process_employee'
  });

  it('여럿이면 길이차 최소', () => {
    const ms: MethodInfo[] = [
      { name: 'calc', line: 1, endLine: 1 },
      { name: 'calculate', line: 2, endLine: 2 },
    ];
    expect(findMethodByName(ms, 'calculate')?.line).toBe(2);
  });

  it('무매칭이면 null', () => {
    expect(findMethodByName(METHODS, 'zzz')).toBeNull();
  });

  it('빈 target은 null', () => {
    expect(findMethodByName(METHODS, '')).toBeNull();
  });
});

describe('extractJumpName — file_name에서 자동 점프 이름 추출', () => {
  it("'Class.method' 형태면 마지막 조각", () => {
    expect(extractJumpName('EmpProcess.processEmployee')).toBe('processEmployee');
  });

  it('실제 확장자(.pc/.java/.c)면 점프 이름 없음(null)', () => {
    expect(extractJumpName('ACCT001.pc')).toBeNull();
    expect(extractJumpName('AcctService.java')).toBeNull();
    expect(extractJumpName('foo.c')).toBeNull();
  });

  it('점이 없으면 null', () => {
    expect(extractJumpName('ACCT002')).toBeNull();
  });

  it('pkg.Class.method는 마지막 조각', () => {
    expect(extractJumpName('com.x.Emp.run')).toBe('run');
  });

  it('괄호가 붙어도 이름만', () => {
    expect(extractJumpName('Foo.doLogin()')).toBe('doLogin');
    expect(extractJumpName('Foo.doLogin(String id)')).toBe('doLogin');
  });

  it('엣지: null/빈/앞뒤 점 → null', () => {
    expect(extractJumpName(null)).toBeNull();
    expect(extractJumpName(undefined)).toBeNull();
    expect(extractJumpName('')).toBeNull();
    expect(extractJumpName('.pc')).toBeNull();
    expect(extractJumpName('foo.')).toBeNull();
  });
});

describe('extractMethods — 함수명과 여는 ( 가 다른 줄 (멀티라인 시그니처 회귀)', () => {
  const names = (code: string, lang: string) => extractMethods(code, lang).map((m) => m.name);

  it('★C: 함수명 다음 줄에 ( 단독, ) 단독이어도 인식', () => {
    const code = `int method
(
    int a,
    int b
)
{
    return 0;
}`;
    expect(names(code, 'c')).toContain('method');
  });

  it('★Java: 함수명 다음 줄에 ( 단독, ) 단독이어도 인식', () => {
    const code = `public class X {
  int method
  (
      int a,
      int b
  )
  {
    return 0;
  }
}`;
    expect(names(code, 'java')).toContain('method');
  });

  it('회귀 C: ) 단독 줄(함수명+( 같은 줄)은 계속 인식', () => {
    const code = `int method(
    int a,
    int b
)
{
    return 0;
}`;
    expect(names(code, 'c')).toContain('method');
  });

  it('회귀 Java: ) 단독 줄(함수명+( 같은 줄)은 계속 인식', () => {
    const code = `public class X {
  int method(
      int a,
      int b
  ) {
    return 0;
  }
}`;
    expect(names(code, 'java')).toContain('method');
  });

  it('과탐지 방지 C: 함수명 다음 줄 ( 가 함수 호출(본문 { 없음)이면 메소드 아님', () => {
    const code = `void run(void) {
    compute
    (
        1,
        2
    );
}`;
    expect(names(code, 'c')).toEqual(['run']); // compute 는 호출 → 제외
  });

  it('과탐지 방지 Java: 분리된 ( 가 호출/제어문이면 메소드 아님', () => {
    const code = `public class X {
  void run() {
    compute
    (
        1,
        2
    );
  }
}`;
    expect(names(code, 'java')).toEqual(['run']); // compute 는 호출 → 제외
  });
});
