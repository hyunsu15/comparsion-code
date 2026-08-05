import { describe, it, expect } from 'vitest';
import { extractMethods } from '../src/methodJump';

// IDE 가 함수/메소드로 인식하는 다양한 선언 스타일을 빠짐없이 잡고,
// 호출/제어문/선언(프로토타입·추상)은 제외하는지 검증한다. (extractMethods 견고화 회귀)

const names = (code: string, lang: string) => extractMethods(code, lang).map((m) => m.name);

// [라벨, 코드, 기대 이름(선언 순서)]
const C_CASES: [string, string, string[]][] = [
  ['기본 K&R', `int f(void) {\n  return 0;\n}`, ['f']],
  ['Allman', `int f(void)\n{\n  return 0;\n}`, ['f']],
  ['멀티라인 )끝', `int f(\n  int a,\n  int b) {\n  return 0;\n}`, ['f']],
  ['멀티라인 )단독', `int f(\n  int a,\n  int b\n) {\n  return 0;\n}`, ['f']],
  ['함수명-( 분리', `int f\n(\n  int a\n) {\n  return 0;\n}`, ['f']],
  ['반환타입 별도 줄', `int\nf(void) {\n  return 0;\n}`, ['f']],
  ['포인터 반환', `char *f(void) {\n  return 0;\n}`, ['f']],
  ['포인터 반환 별도줄', `char *\nf(void) {\n  return 0;\n}`, ['f']],
  ['static 수식어', `static int f(void) {\n  return 0;\n}`, ['f']],
  ['const 포인터 반환', `const char *f(void) {\n  return 0;\n}`, ['f']],
  ['unsigned 반환', `unsigned long f(void) {\n  return 0;\n}`, ['f']],
  ['struct 반환', `struct S f(void) {\n  return 0;\n}`, ['f']],
  ['struct 포인터 반환', `struct S *f(void) {\n  return 0;\n}`, ['f']],
  ['배열 파라미터', `void f(int a[], int n) {\n  a[0] = n;\n}`, ['f']],
  ['함수포인터 파라미터', `void f(int (*cb)(int)) {\n  cb(0);\n}`, ['f']],
  ['함수포인터 반환', `void (*f(int x))(int) {\n  return 0;\n}`, ['f']],
  ['가변인자', `int f(int n, ...) {\n  return n;\n}`, ['f']],
  ['주석 섞인 시그니처', `int /* x */ f(void) /* y */ {\n  return 0;\n}`, ['f']],
  ['수식어+포인터+멀티라인+)단독', `static const char *\nf(\n  int a\n)\n{\n  return 0;\n}`, ['f']],
  ['멀티라인+분리+주석 조합', `static int /* r */\nf\n(\n  int a /* p */\n)\n{\n  return a;\n}`, ['f']],
  ['들여쓰기 함수(블록 밖)', `void outer(void) {\n}\n    int inner(int x) {\n        return x;\n    }`, ['outer', 'inner']],
  ['반환 수식어 여러 줄', `static\nconst char *\nf(void) {\n  return 0;\n}`, ['f']],
  ['여러 함수 연속', `int a(void) {\n  return 1;\n}\nint b(void) {\n  return 2;\n}`, ['a', 'b']],
  ['프로토타입 제외', `int f(void);\nint g(void) {\n  return 0;\n}`, ['g']],
  ['호출/제어문 제외', `void run(void) {\n  if (x) { foo(); }\n  for (;;) { bar(); }\n  baz(1, 2);\n}`, ['run']],
];

const J_CASES: [string, string, string[]][] = [
  ['기본', `class X {\n int f() {\n  return 0;\n }\n}`, ['f']],
  ['Allman', `class X {\n int f()\n {\n  return 0;\n }\n}`, ['f']],
  ['멀티라인 )단독', `class X {\n int f(\n  int a,\n  int b\n ) {\n  return 0;\n }\n}`, ['f']],
  ['메소드명-( 분리', `class X {\n int f\n (\n  int a\n ) {\n  return 0;\n }\n}`, ['f']],
  ['제네릭 반환', `class X {\n Map<String, Integer> f() {\n  return null;\n }\n}`, ['f']],
  ['제네릭 반환 별도줄', `class X {\n Map<String, Integer>\n f() {\n  return null;\n }\n}`, ['f']],
  ['제네릭 메소드', `class X {\n <T> T f(T x) {\n  return x;\n }\n}`, ['f']],
  ['bounded 제네릭', `class X {\n <T extends Number> T f(T x) {\n  return x;\n }\n}`, ['f']],
  ['중첩 제네릭 반환', `class X {\n Map<String, List<Integer>> f() {\n  return null;\n }\n}`, ['f']],
  ['와일드카드 제네릭', `class X {\n List<? extends Number> f() {\n  return null;\n }\n}`, ['f']],
  ['제네릭 배열 반환', `class X {\n List<String>[] f() {\n  return null;\n }\n}`, ['f']],
  ['중첩 제네릭 멀티라인', `class X {\n Map<String,\n  Integer> f() {\n  return null;\n }\n}`, ['f']],
  ['제네릭 <T> 별도줄', `class X {\n <T>\n T f(T x) {\n  return x;\n }\n}`, ['f']],
  ['어노테이션', `class X {\n @Override\n public String f() {\n  return "";\n }\n}`, ['f']],
  ['어노테이션 파라미터', `class X {\n @Foo("bar")\n public void f() {\n }\n}`, ['f']],
  ['여러 어노테이션', `class X {\n @A @B("x")\n public void f() {\n }\n}`, ['f']],
  ['멀티라인 어노테이션', `class X {\n @Foo(\n  "x"\n )\n public void f() {\n }\n}`, ['f']],
  ['throws 같은줄', `class X {\n void f() throws Exception {\n }\n}`, ['f']],
  ['throws 다음줄', `class X {\n void f()\n   throws Exception {\n }\n}`, ['f']],
  ['제네릭메소드+throws', `class X {\n <T> T f(T x) throws Exception {\n  return x;\n }\n}`, ['f']],
  ['수식어 조합', `class X {\n public static final int f() {\n  return 0;\n }\n}`, ['f']],
  ['배열 반환', `class X {\n int[] f() {\n  return null;\n }\n}`, ['f']],
  ['varargs', `class X {\n void f(String... a) {\n }\n}`, ['f']],
  ['생성자 수식어없음', `class Money {\n Money(long a) {\n  this.a = a;\n }\n}`, ['Money']],
  ['default 메소드', `interface X {\n default void f() {\n }\n}`, ['f']],
  ['여러 메소드', `class X {\n void a() {\n }\n void b() {\n }\n}`, ['a', 'b']],
  ['추상/인터페이스 제외', `interface X {\n void f();\n int g();\n}`, []],
  ['호출/new/제어 제외', `class X {\n void run() {\n  if (c) { go(); }\n  Runnable r = new Runnable() { };\n  call(1, 2);\n }\n}`, ['run']],
];

describe('extractMethods 스타일 — C (IDE 인식 범위)', () => {
  for (const [label, code, expected] of C_CASES) {
    it(label, () => expect(names(code, 'c')).toEqual(expected));
  }
});

describe('extractMethods 스타일 — Java (IDE 인식 범위)', () => {
  for (const [label, code, expected] of J_CASES) {
    it(label, () => expect(names(code, 'java')).toEqual(expected));
  }
});
