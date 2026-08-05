# PB5 매퍼 SQL 대응 보기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PB5 Java의 매퍼 호출 줄을 클릭하면 숨은 MyBatis XML SQL을 끌어와 PB 인라인 EXEC SQL과 나란히 대응시켜 보여 준다.

**Architecture:** 순수 파싱/매칭 로직은 신규 `src/sqlLink.ts`(React/DOM 비의존, 단위테스트)로 분리한다. `src/Link.ts`에 매퍼 XML을 이름으로 끌어오는 `resolveXmlByName`를 추가(기존 에셋 인덱스 재사용)한다. `src/CodeComparator.tsx`는 클릭 핸들러에 분기 1개를 더해 "SQL 대응 카드"(양쪽 스니펫)와 "전체 매퍼 XML 슬라이드 패널"(`CodeBlock` 재사용)을 띄운다.

**Tech Stack:** TypeScript(strict), React, Vite, Vitest(node 환경), Shiki(`CodeBlock`), Tailwind.

## Global Constraints

- 들여쓰기 3단계 이하, Guard Clause(early return) 사용. (코딩가이드)
- strict 타입. `as any` / `as unknown as` 금지. 암묵 계약을 타입으로 드러낸다.
- 기존 public/export 시그니처는 변경하지 않는다. **추가만** 한다. (리팩토링가이드)
- 안 쓰는 변수/함수/import를 남기지 않는다.
- 테스트는 출력 행동을 검증한다(커버리지 채우기용 문자열 검증 금지). 외부 경계만 mock, 내부 구현 mock 금지. (테스트가이드)
- FE 검증: `npx vite build` (타입+빌드). 단위테스트: `npx vitest run`.
- 작업 트리에 사용자의 기존 미커밋 변경분이 많다. **커밋은 항상 해당 태스크 파일만 명시적 경로로 `git add`** 한다(`git add -A` 금지).
- 모든 커밋 메시지는 Co-Authored-By 트레일러로 끝낸다: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 매칭 키는 `(verb, table)`. 실패 시 추측 금지(토스트/카드 "못 찾음").
- `findMapperStatement`는 여는 태그의 `id` 속성이 verb 태그와 **같은 줄**에 있다고 가정(일반 매퍼 작성 관례). 커서 기반 SELECT(`DECLARE ... CURSOR`/`FETCH`)는 v1 범위 밖.
- 트리거는 PB5(오른쪽, side 'B') 그리고 `langB === 'java'` 일 때만.

---

### Task 1: `sqlLink.ts` — 타입 + `detectMapperCall`

**Files:**
- Create: `src/sqlLink.ts`
- Test: `test/sqlLink.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `type SqlVerb = 'select' | 'insert' | 'update' | 'delete'`
  - `interface MapperCall { receiver: string; methodName: string; mapperType: string; namespace: string | null }`
  - `interface SqlStatement { verb: SqlVerb; table: string | null; startLine: number; endLine: number; sqlText: string }`
  - `interface MapperStatement extends SqlStatement { id: string }`
  - `detectMapperCall(lineText: string, javaCode: string): MapperCall | null`

- [ ] **Step 1: Write the failing test**

Create `test/sqlLink.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectMapperCall } from '../src/sqlLink';

const JAVA = `package com.example.acct;
import com.example.acct.AcctMapper;
public class AcctService {
  private final AcctMapper acctMapper;
  public void processAccount(String acctNo) {
    int affected = acctMapper.insertAccount(account);
    BigDecimal interest = calculateInterest(balance);
  }
}`;

describe('detectMapperCall', () => {
  it('매퍼 필드 호출을 인식한다', () => {
    expect(detectMapperCall('    int affected = acctMapper.insertAccount(account);', JAVA)).toEqual({
      receiver: 'acctMapper',
      methodName: 'insertAccount',
      mapperType: 'AcctMapper',
      namespace: 'com.example.acct.AcctMapper',
    });
  });

  it('로컬 메소드 호출(receiver 없음)은 null', () => {
    expect(detectMapperCall('    BigDecimal interest = calculateInterest(balance);', JAVA)).toBeNull();
  });

  it('receiver 타입이 *Mapper 가 아니면 null', () => {
    expect(detectMapperCall('    balance.multiply(x);', JAVA)).toBeNull();
  });

  it('import 가 없으면 namespace 는 null, mapperType 은 도출', () => {
    const java = 'public class S { private final FooMapper fooMapper; void r(){ fooMapper.run(x); } }';
    expect(detectMapperCall('fooMapper.run(x);', java)).toEqual({
      receiver: 'fooMapper',
      methodName: 'run',
      mapperType: 'FooMapper',
      namespace: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: FAIL — `Failed to resolve import "../src/sqlLink"` (파일 없음).

- [ ] **Step 3: Write minimal implementation**

Create `src/sqlLink.ts`:

```ts
// PB(Pro*C 인라인 EXEC SQL) ↔ PB5(Java 매퍼 호출 → MyBatis XML) SQL 대응을 위한 순수 로직.
// React/DOM 비의존 → 단위테스트 대상(test/sqlLink.test.ts).

export type SqlVerb = 'select' | 'insert' | 'update' | 'delete';

/** PB5 Java 의 매퍼 호출 인식 결과 */
export interface MapperCall {
  receiver: string; // 'acctMapper'
  methodName: string; // 'insertAccount'
  mapperType: string; // 'AcctMapper'
  namespace: string | null; // 'com.example.acct.AcctMapper' (import 도출, 없으면 null)
}

/** SQL 구문 한 건의 위치/분류 (PB 인라인 / PB5 매퍼 공용) */
export interface SqlStatement {
  verb: SqlVerb;
  table: string | null; // best-effort
  startLine: number; // 1-base
  endLine: number; // 1-base
  sqlText: string;
}

/** MyBatis 매퍼 구문 (id 포함) */
export interface MapperStatement extends SqlStatement {
  id: string; // 'insertAccount'
}

// 정규식 특수문자 이스케이프(식별자엔 보통 없지만 방어적으로).
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// receiver 식별자의 선언 타입이 '*Mapper' 인지 찾는다. 예) 'private final AcctMapper acctMapper;'
const findReceiverMapperType = (javaCode: string, receiver: string): string | null => {
  const re = new RegExp(`\\b([A-Za-z_$][\\w$]*Mapper)\\s+${escapeRegExp(receiver)}\\b`);
  return javaCode.match(re)?.[1] ?? null;
};

// mapperType 의 import 풀네임(namespace)을 찾는다. 예) 'import com.example.acct.AcctMapper;'
const findMapperNamespace = (javaCode: string, mapperType: string): string | null => {
  const re = new RegExp(`\\bimport\\s+([\\w.]+\\.${escapeRegExp(mapperType)})\\s*;`);
  return javaCode.match(re)?.[1] ?? null;
};

const CALL_RE = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * 클릭한 Java 한 줄에서 매퍼 호출('receiver.method(')을 인식한다.
 * receiver 의 선언 타입이 '*Mapper' 일 때만 매퍼 호출로 인정(로컬/일반 호출 배제).
 * 인식 실패 시 null → 일반 클릭(무동작)로 둔다.
 */
export const detectMapperCall = (lineText: string, javaCode: string): MapperCall | null => {
  CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(lineText)) !== null) {
    const receiver = m[1];
    const methodName = m[2];
    const mapperType = findReceiverMapperType(javaCode, receiver);
    if (!mapperType) continue;
    return { receiver, methodName, mapperType, namespace: findMapperNamespace(javaCode, mapperType) };
  }
  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sqlLink.ts test/sqlLink.test.ts
git commit -m "feat : sqlLink detectMapperCall (PB5 매퍼 호출 인식)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `findMapperStatement` + `extractTable`

**Files:**
- Modify: `src/sqlLink.ts`
- Test: `test/sqlLink.test.ts`

**Interfaces:**
- Consumes: `SqlVerb`, `MapperStatement` (Task 1)
- Produces: `findMapperStatement(xml: string, id: string): MapperStatement | null`
  - 내부 헬퍼 `extractTable(sqlText: string, verb: SqlVerb): string | null` (Task 3 에서 재사용)

- [ ] **Step 1: Write the failing test**

Append to `test/sqlLink.test.ts`:

```ts
import { findMapperStatement } from '../src/sqlLink';

const XML = `<?xml version="1.0"?>
<mapper namespace="com.example.acct.AcctMapper">
    <insert id="insertAccount" parameterType="com.example.acct.Account">
        INSERT INTO account (acct_no, balance, interest)
        VALUES (#{acctNo}, #{balance}, #{interest})
    </insert>
    <select id="selectAccount" resultMap="accountResult">
        SELECT acct_no FROM account WHERE acct_no = #{acctNo}
    </select>
</mapper>`;

describe('findMapperStatement', () => {
  it('insert 구문의 줄범위/verb/table 을 찾는다', () => {
    const s = findMapperStatement(XML, 'insertAccount');
    expect(s?.verb).toBe('insert');
    expect(s?.table).toBe('account');
    expect(s?.startLine).toBe(3);
    expect(s?.endLine).toBe(6);
    expect(s?.sqlText).toContain('INSERT INTO account');
  });

  it('select 구문도 찾는다', () => {
    const s = findMapperStatement(XML, 'selectAccount');
    expect(s?.verb).toBe('select');
    expect(s?.table).toBe('account');
  });

  it('없는 id 는 null', () => {
    expect(findMapperStatement(XML, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: FAIL — `"../src/sqlLink" does not provide an export named 'findMapperStatement'`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/sqlLink.ts`:

```ts
const TABLE_RE: Record<SqlVerb, RegExp> = {
  insert: /\binto\s+([A-Za-z_][\w$.]*)/i,
  update: /\bupdate\s+([A-Za-z_][\w$.]*)/i,
  delete: /\bdelete\s+from\s+([A-Za-z_][\w$.]*)/i,
  select: /\bfrom\s+([A-Za-z_][\w$.]*)/i,
};

// SQL 텍스트에서 대상 테이블을 best-effort 추출(소문자화). 못 찾으면 null.
const extractTable = (sqlText: string, verb: SqlVerb): string | null =>
  sqlText.match(TABLE_RE[verb])?.[1].toLowerCase() ?? null;

const OPEN_TAG_RE = /<(select|insert|update|delete)\b[^>]*\bid\s*=\s*"([^"]+)"/;

/**
 * 매퍼 XML 전체에서 statement id 한 건의 블록(줄범위/verb/table/sql)을 찾는다.
 * 여는 태그의 id 속성은 verb 태그와 같은 줄에 있다고 가정(일반 매퍼 작성 관례).
 */
export const findMapperStatement = (xml: string, id: string): MapperStatement | null => {
  const lines = xml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(OPEN_TAG_RE);
    if (!open || open[2] !== id) continue;

    const verb = open[1] as SqlVerb;
    const closeRe = new RegExp(`</${verb}\\s*>`);
    let endLine = i + 1;
    for (let j = i; j < lines.length; j++) {
      if (closeRe.test(lines[j])) {
        endLine = j + 1;
        break;
      }
    }
    const sqlText = lines.slice(i, endLine).join('\n');
    return { id, verb, table: extractTable(sqlText, verb), startLine: i + 1, endLine, sqlText };
  }
  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sqlLink.ts test/sqlLink.test.ts
git commit -m "feat : sqlLink findMapperStatement (매퍼 구문 위치/테이블 추출)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `extractEmbeddedSql`

**Files:**
- Modify: `src/sqlLink.ts`
- Test: `test/sqlLink.test.ts`

**Interfaces:**
- Consumes: `SqlVerb`, `SqlStatement` (Task 1), `extractTable` (Task 2)
- Produces: `extractEmbeddedSql(pcCode: string): SqlStatement[]`

- [ ] **Step 1: Write the failing test**

Append to `test/sqlLink.test.ts`:

```ts
import { extractEmbeddedSql } from '../src/sqlLink';

const PC = `void process_account() {
    EXEC SQL BEGIN DECLARE SECTION;
        char v[20];
    EXEC SQL END DECLARE SECTION;

    EXEC SQL INSERT INTO account (acct_no, balance)
        VALUES (:v_acct_no, :v_balance);
    EXEC SQL COMMIT WORK RELEASE;
}`;

describe('extractEmbeddedSql', () => {
  it('DML(INSERT)만 추출하고 비-DML(DECLARE/COMMIT)은 제외', () => {
    const r = extractEmbeddedSql(PC);
    expect(r).toHaveLength(1);
    expect(r[0].verb).toBe('insert');
    expect(r[0].table).toBe('account');
    expect(r[0].startLine).toBe(6);
    expect(r[0].endLine).toBe(7);
  });

  it('싱글톤 SELECT INTO 도 추출(FROM 테이블 인식)', () => {
    const pc = 'EXEC SQL SELECT bal INTO :b FROM account WHERE id = :i;';
    const r = extractEmbeddedSql(pc);
    expect(r).toHaveLength(1);
    expect(r[0].verb).toBe('select');
    expect(r[0].table).toBe('account');
  });

  it('EXEC SQL 이 없으면 빈 배열', () => {
    expect(extractEmbeddedSql('int main(){return 0;}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: FAIL — `does not provide an export named 'extractEmbeddedSql'`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/sqlLink.ts`:

```ts
const EXEC_SQL_RE = /\bEXEC\s+SQL\b/i;
// EXEC SQL 바로 뒤(옵션 'AT db')의 DML 동사만 인정. CONNECT/COMMIT/DECLARE/INCLUDE/OPEN/FETCH 등은 제외.
const EXEC_VERB_RE = /\bEXEC\s+SQL\b\s+(?:AT\s+\w+\s+)?(SELECT|INSERT|UPDATE|DELETE)\b/i;

const classifyExecVerb = (text: string): SqlVerb | null => {
  const v = text.match(EXEC_VERB_RE)?.[1];
  return v ? (v.toLowerCase() as SqlVerb) : null;
};

/**
 * PB(.pc)의 인라인 EXEC SQL 중 DML(SELECT/INSERT/UPDATE/DELETE) 블록 목록을 추출한다.
 * 한 문장은 ';' 로 끝난다(여러 줄 가능). 비-DML(CONNECT/COMMIT/DECLARE SECTION/INCLUDE 등) 제외.
 * 커서 기반 SELECT(DECLARE ... CURSOR / FETCH)는 v1 범위 밖(직접 DML만).
 */
export const extractEmbeddedSql = (pcCode: string): SqlStatement[] => {
  const lines = pcCode.split('\n');
  const out: SqlStatement[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!EXEC_SQL_RE.test(lines[i])) continue;

    let end = i;
    while (end < lines.length && !lines[end].includes(';')) end++;
    if (end >= lines.length) end = lines.length - 1;

    const sqlText = lines.slice(i, end + 1).join('\n');
    const verb = classifyExecVerb(sqlText);
    if (verb) {
      out.push({ verb, table: extractTable(sqlText, verb), startLine: i + 1, endLine: end + 1, sqlText });
    }
    i = end;
  }
  return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sqlLink.ts test/sqlLink.test.ts
git commit -m "feat : sqlLink extractEmbeddedSql (PB 인라인 EXEC SQL 추출)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `matchEmbeddedSql`

**Files:**
- Modify: `src/sqlLink.ts`
- Test: `test/sqlLink.test.ts`

**Interfaces:**
- Consumes: `MapperStatement`, `SqlStatement` (Task 1)
- Produces: `matchEmbeddedSql(target: MapperStatement, candidates: SqlStatement[]): { match: SqlStatement | null; candidateCount: number }`

- [ ] **Step 1: Write the failing test**

Append to `test/sqlLink.test.ts`:

```ts
import { matchEmbeddedSql } from '../src/sqlLink';
import type { MapperStatement, SqlStatement } from '../src/sqlLink';

const TARGET: MapperStatement = { id: 'insertAccount', verb: 'insert', table: 'account', startLine: 1, endLine: 3, sqlText: '' };

describe('matchEmbeddedSql', () => {
  it('(verb, table) 일치하는 PB SQL 을 찾는다', () => {
    const cands: SqlStatement[] = [
      { verb: 'select', table: 'account', startLine: 1, endLine: 1, sqlText: 's' },
      { verb: 'insert', table: 'account', startLine: 5, endLine: 6, sqlText: 'i' },
    ];
    const r = matchEmbeddedSql(TARGET, cands);
    expect(r.match?.sqlText).toBe('i');
    expect(r.candidateCount).toBe(1);
  });

  it('table 불일치 시 verb 로 폴백(모호하면 다건 노출)', () => {
    const cands: SqlStatement[] = [
      { verb: 'insert', table: 'other', startLine: 1, endLine: 1, sqlText: 'a' },
      { verb: 'insert', table: null, startLine: 2, endLine: 2, sqlText: 'b' },
    ];
    const r = matchEmbeddedSql(TARGET, cands);
    expect(r.match?.sqlText).toBe('a');
    expect(r.candidateCount).toBe(2);
  });

  it('대응 없으면 match=null, count=0', () => {
    const cands: SqlStatement[] = [{ verb: 'delete', table: 'account', startLine: 1, endLine: 1, sqlText: 'd' }];
    expect(matchEmbeddedSql(TARGET, cands)).toEqual({ match: null, candidateCount: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: FAIL — `does not provide an export named 'matchEmbeddedSql'`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/sqlLink.ts`:

```ts
/**
 * 매퍼 구문에 대응하는 PB 인라인 SQL 을 찾는다.
 *  1순위 (verb, table) 일치 / table 추출 실패 시 verb 일치로 폴백.
 *  match: 첫 후보(없으면 null), candidateCount: 후보 수(>1 이면 모호 → UI 배지).
 */
export const matchEmbeddedSql = (
  target: MapperStatement,
  candidates: SqlStatement[],
): { match: SqlStatement | null; candidateCount: number } => {
  const byTable =
    target.table != null
      ? candidates.filter((c) => c.verb === target.verb && c.table === target.table)
      : [];
  if (byTable.length > 0) return { match: byTable[0], candidateCount: byTable.length };

  const byVerb = candidates.filter((c) => c.verb === target.verb);
  return { match: byVerb[0] ?? null, candidateCount: byVerb.length };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sqlLink.test.ts`
Expected: PASS (13 passed).

- [ ] **Step 5: Commit**

```bash
git add src/sqlLink.ts test/sqlLink.test.ts
git commit -m "feat : sqlLink matchEmbeddedSql (verb+table 대응 매칭)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `Link.ts` — `resolveXmlByName` (매퍼 XML 끌어오기)

**Files:**
- Modify: `src/Link.ts`

**Interfaces:**
- Consumes: 기존 `modules`/`indexByKind` 빌드 루프, `stemOf`, `addKey`, `CodeAsset`
- Produces: `resolveXmlByName(name: string | null | undefined): Promise<{ content: string; path: string } | null>`

> 참고: `Link.ts`는 `import.meta.glob` 의존이라 node 환경 vitest 단위테스트 대상이 아니다(기존에도 미테스트). `vite build` 로 타입/빌드 검증한다.

- [ ] **Step 1: 매퍼 XML 전용 인덱스 선언 추가**

`src/Link.ts` 에서 `indexByKind` 선언 블록 바로 아래(현재 80–83행 근처)에 추가:

```ts
// 매퍼 XML 전용 인덱스: 'AcctMapper.xml' 과 'AcctMapper' 키로 찾는다(java 와 혼동 방지).
const xmlByName: Map<string, CodeAsset> = new Map();
```

- [ ] **Step 2: 빌드 루프에서 xml 인덱싱**

`src/Link.ts` 의 `for (const [path, loadUrl] of Object.entries(modules))` 루프 안, `if (kind === 'pb') { ... }` 블록 **다음**(현재 139행 근처)에 추가:

```ts
  if (ext === 'xml') {
    addKey(xmlByName, name, asset); // 'AcctMapper.xml'
    addKey(xmlByName, stemOf(name), asset); // 'AcctMapper'
  }
```

- [ ] **Step 3: `resolveXmlByName` export 추가**

`src/Link.ts` 의 `resolveSourceContent` 함수 정의 **아래**(파일 끝의 `export default LINK_PRESETS;` 바로 위)에 추가:

```ts
/**
 * 매퍼 클래스명(또는 파일명)으로 XML 매퍼 파일을 찾아 지연 로딩한다.
 *   resolveXmlByName('AcctMapper') → { content, path } | null
 */
export async function resolveXmlByName(
  name: string | null | undefined,
): Promise<{ content: string; path: string } | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const asset = xmlByName.get(trimmed) ?? xmlByName.get(stemOf(trimmed));
  if (!asset) return null;
  return { content: await asset.load(), path: asset.path };
}
```

- [ ] **Step 4: 빌드로 검증**

Run: `npx vite build`
Expected: 빌드 성공(타입 에러 없음).

- [ ] **Step 5: Commit**

```bash
git add src/Link.ts
git commit -m "feat : Link resolveXmlByName (매퍼 XML 이름으로 끌어오기)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `CodeComparator` — 상태 + `openSqlPeek` + 클릭 분기

**Files:**
- Modify: `src/CodeComparator.tsx`

**Interfaces:**
- Consumes: `detectMapperCall`, `findMapperStatement`, `extractEmbeddedSql`, `matchEmbeddedSql` (sqlLink), `resolveXmlByName` (Link), 기존 `codeA`/`codeB`/`fileNameA`/`langB`/`showToast`/`getSmartPosition`/`getErrorMessage`, `CodeBlockHandle`
- Produces: 상태 `sqlPeek`/`sqlPanel`/`sqlPanelHighlight`/`sqlPanelRef`, `openSqlPeek(lineNum, clientX, clientY)`, 클릭 핸들러 분기

- [ ] **Step 1: import 추가**

`src/CodeComparator.tsx` 2행 `import { resolveSourceContent } from './Link';` 을 다음으로 교체:

```ts
import { resolveSourceContent, resolveXmlByName } from './Link';
```

그리고 `import { findMatches } from './codeSearch';`(20행) 아래에 추가:

```ts
import { detectMapperCall, findMapperStatement, extractEmbeddedSql, matchEmbeddedSql } from './sqlLink';
```

- [ ] **Step 2: 상태 추가**

`const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);`(177행 근처) 아래에 추가:

```ts
  // SQL 대응 보기: PB5 매퍼 호출 클릭 → 카드(양쪽 SQL 스니펫) + 전체 매퍼 XML 패널
  interface SqlPeekState {
    methodName: string;
    pbFileName: string;
    pb5FileName: string;
    pb5Sql: string;
    pb5FullContent: string;
    pb5StartLine: number;
    pbSql: string | null;
    candidateCount: number;
    x: number;
    y: number;
  }
  const [sqlPeek, setSqlPeek] = useState<SqlPeekState | null>(null);
  const [sqlPanel, setSqlPanel] = useState<{ fileName: string; content: string; line: number } | null>(null);
  const [sqlPanelHighlight, setSqlPanelHighlight] = useState(0);
  const sqlPanelRef = React.useRef<CodeBlockHandle>(null);
  // ⚠️ 패널 CodeBlock의 onHighlight는 반드시 안정적 참조(useCallback)여야 한다.
  // 인라인 화살표를 넘기면 CodeBlock의 useEffect([tokens, onHighlight])가 매 렌더 재실행되어
  // setState→재렌더→새 함수→… "Maximum update depth exceeded" 무한 루프가 (패널 열 때) 발생한다.
  const handleSqlPanelHighlight = useCallback(() => setSqlPanelHighlight((n) => n + 1), []);
```

- [ ] **Step 3: `openSqlPeek` 추가**

`const handleCodeClick = useCallback(...)` 정의(600행 근처) **바로 위**에 추가:

```ts
  // PB5(Java) 매퍼 호출 줄 클릭 → 매퍼 XML SQL 을 끌어와 PB 인라인 SQL 과 대응 카드를 연다.
  // 매퍼 호출이 아니면 무동작(반환만). 실패는 토스트로 정직하게 안내(추측 금지).
  const openSqlPeek = useCallback(async (lineNum: number, clientX: number, clientY: number): Promise<void> => {
    const lineText = codeB.split('\n')[lineNum - 1] ?? '';
    const call = detectMapperCall(lineText, codeB);
    if (!call) return;

    try {
      const xml = await resolveXmlByName(call.mapperType);
      if (!xml) {
        showToast(`관련 매퍼 XML(${call.mapperType})을 찾지 못했습니다.`, 'error');
        return;
      }
      const stmt = findMapperStatement(xml.content, call.methodName);
      if (!stmt) {
        showToast(`매퍼에 ${call.methodName} 구문이 없습니다.`, 'error');
        return;
      }
      const { match, candidateCount } = matchEmbeddedSql(stmt, extractEmbeddedSql(codeA));
      const xmlFileName = xml.path.split('/').pop() ?? `${call.mapperType}.xml`;
      const { x, y } = getSmartPosition(clientX, clientY);
      setSqlPeek({
        methodName: call.methodName,
        pbFileName: fileNameA,
        pb5FileName: xmlFileName,
        pb5Sql: stmt.sqlText,
        pb5FullContent: xml.content,
        pb5StartLine: stmt.startLine,
        pbSql: match?.sqlText ?? null,
        candidateCount,
        x,
        y,
      });
    } catch (err) {
      showToast(`SQL을 불러오지 못했습니다: ${getErrorMessage(err)}`, 'error');
    }
  }, [codeA, codeB, fileNameA, showToast]);
```

- [ ] **Step 4: 클릭 핸들러에 분기 추가**

`handleCodeClick` 안의 `} else if (method) { ... }` 블록(649–667행 근처)의 닫는 `}` 뒤에 `else if` 를 잇는다. 즉 현재:

```ts
      } else if (method) {
        if (e.altKey) {
          // ... 기존 Alt 점프 ...
        } else {
          toggleFold(side, lineNum);
        }
      }
```

를 다음으로 만든다(끝에 분기 추가):

```ts
      } else if (method) {
        if (e.altKey) {
          // ... 기존 Alt 점프 (변경 없음) ...
        } else {
          toggleFold(side, lineNum);
        }
      } else if (!e.altKey && side === 'B' && langB === 'java') {
        // 비-메소드 줄 plain 클릭(PB5/Java): 매퍼 호출이면 SQL 대응 카드 시도
        void openSqlPeek(lineNum, e.clientX, e.clientY);
      }
```

그리고 같은 `useCallback` 의 deps 배열(668행 근처)에 `langB`, `openSqlPeek` 를 추가한다:

```ts
  }, [methodsA, methodsB, methodMatches, scrollToLine, toggleFold, threads, activePresetKey, showToast, langB, openSqlPeek]);
```

- [ ] **Step 5: 빌드로 검증**

Run: `npx vite build`
Expected: 빌드 성공(타입 에러 없음). (아직 카드/패널 UI 없음 → 클릭해도 카드 렌더는 Task 7에서)

- [ ] **Step 6: Commit**

```bash
git add src/CodeComparator.tsx
git commit -m "feat : CodeComparator SQL 대응 클릭 분기+openSqlPeek 배선" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `CodeComparator` — SQL 대응 카드 렌더

**Files:**
- Modify: `src/CodeComparator.tsx`

**Interfaces:**
- Consumes: `sqlPeek`/`setSqlPeek`, `setSqlPanel` (Task 6)
- Produces: 카드 JSX (PB·PB5 스니펫 + "전체 매퍼 보기" 버튼 + 후보 배지 + 빈 상태)

- [ ] **Step 1: 카드 JSX 추가**

`src/CodeComparator.tsx` 의 토스트 블록(`{toast && ( ... )}`, 1510–1520행 근처) **아래**, `<Checklist ... />`(1523행 근처) **위**에 추가:

```tsx
      {/* SQL 대응 카드: PB 원본 EXEC SQL ↔ PB5 매퍼 SQL */}
      {sqlPeek && (
        <div className="fixed inset-0 z-[120]" onClick={() => setSqlPeek(null)}>
          <div className="absolute" style={{ left: sqlPeek.x, top: sqlPeek.y }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-white border border-gray-200 rounded-2xl w-[560px] shadow-2xl text-gray-800 font-sans overflow-hidden flex flex-col border-t-4 border-t-amber-500">
              <div className="bg-white px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">SQL 대응</span>
                  <span className="font-black text-[15px] text-gray-900 truncate">{sqlPeek.methodName}</span>
                  {sqlPeek.candidateCount > 1 && (
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-black whitespace-nowrap">대응 후보 {sqlPeek.candidateCount}건</span>
                  )}
                </div>
                <button onClick={() => setSqlPeek(null)} aria-label="SQL 대응 닫기" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div>
                  <div className="text-[11px] font-black text-indigo-600 mb-1">📄 PB 원본 · {sqlPeek.pbFileName || '(파일 없음)'}</div>
                  {sqlPeek.pbSql ? (
                    <pre className="m-0 p-3 bg-[#1e1e1e] rounded-lg font-mono text-[12.5px] text-slate-200 overflow-x-auto whitespace-pre">{sqlPeek.pbSql}</pre>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 font-bold italic">대응되는 PB 원본 SQL을 찾지 못했습니다.</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black text-emerald-600 mb-1 flex items-center justify-between gap-2">
                    <span className="truncate">📄 PB5 매퍼 · {sqlPeek.pb5FileName}</span>
                    <button
                      onClick={() => {
                        setSqlPanel({ fileName: sqlPeek.pb5FileName, content: sqlPeek.pb5FullContent, line: sqlPeek.pb5StartLine });
                        setSqlPeek(null);
                      }}
                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black transition-colors whitespace-nowrap"
                    >
                      전체 매퍼 보기
                    </button>
                  </div>
                  <pre className="m-0 p-3 bg-[#1e1e1e] rounded-lg font-mono text-[12.5px] text-slate-200 overflow-x-auto whitespace-pre">{sqlPeek.pb5Sql}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: 빌드로 검증**

Run: `npx vite build`
Expected: 빌드 성공.

- [ ] **Step 3: 수동 스모크(개발 서버)**

`npm run dev` 후 '서비스' 분류의 ACCT 비교를 열고, 오른쪽(PB5) `acctMapper.insertAccount(account)` 줄을 클릭.
Expected: 카드가 뜨고 상단에 PB `EXEC SQL INSERT INTO account ...`, 하단에 `<insert id="insertAccount">` SQL 이 보인다. 바깥 클릭/×로 닫힌다.

- [ ] **Step 4: Commit**

```bash
git add src/CodeComparator.tsx
git commit -m "feat : CodeComparator SQL 대응 카드(양쪽 스니펫) 렌더" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `CodeComparator` — 전체 매퍼 XML 슬라이드 패널

**Files:**
- Modify: `src/CodeComparator.tsx`

**Interfaces:**
- Consumes: `sqlPanel`/`setSqlPanel`, `sqlPanelHighlight`/`setSqlPanelHighlight`, `sqlPanelRef`, `fontSize`, `CodeBlock`
- Produces: 우측 슬라이드 패널(XML 전체 + 해당 구문 스크롤/하이라이트) + ESC 닫기

- [ ] **Step 1: 패널 하이라이트 완료 시 스크롤 effect 추가**

`src/CodeComparator.tsx` 의 "지정 줄 점프" effect(516–520행 근처) 아래에 추가:

```ts
  // 매퍼 XML 패널이 하이라이트(토큰 준비)되면 해당 구문 줄로 1회 스크롤+강조.
  useEffect(() => {
    if (!sqlPanel) return;
    sqlPanelRef.current?.scrollToLine(sqlPanel.line);
  }, [sqlPanel, sqlPanelHighlight]);
```

- [ ] **Step 2: ESC 닫기 확장**

`src/CodeComparator.tsx` 의 ESC effect(796–805행 근처)에서 분기와 deps 를 확장한다. 본문을:

```ts
      if (e.key !== 'Escape') return;
      if (isCloseConfirmOpen) setIsCloseConfirmOpen(false);
      else if (isCommentInputOpen) setIsCommentInputOpen(null);
      else if (activeThread) setActiveThread(null);
      else if (sqlPanel) setSqlPanel(null);
      else if (sqlPeek) setSqlPeek(null);
```

로 바꾸고, deps 배열을:

```ts
  }, [isCloseConfirmOpen, isCommentInputOpen, activeThread, sqlPanel, sqlPeek]);
```

로 바꾼다.

- [ ] **Step 3: 슬라이드 패널 JSX 추가**

Task 7 에서 추가한 카드 블록 **아래**, `<Checklist ... />` **위**에 추가:

```tsx
      {/* 전체 매퍼 XML 슬라이드 패널 (옵션 b: include/resultMap 등 스니펫만으로 불완전한 부분 확인) */}
      <div
        className={`fixed top-0 right-0 h-full w-[46vw] max-w-[760px] bg-white shadow-2xl z-[125] border-l border-slate-200 flex flex-col transition-transform duration-300 ${sqlPanel ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!sqlPanel}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 text-white flex-shrink-0">
          <span className="font-black text-sm truncate">📄 {sqlPanel?.fileName ?? ''}</span>
          <button onClick={() => setSqlPanel(null)} aria-label="매퍼 패널 닫기" className="w-8 h-8 rounded-full hover:bg-emerald-700 flex items-center justify-center text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0 font-mono">
          {sqlPanel && (
            <CodeBlock
              ref={sqlPanelRef}
              code={sqlPanel.content}
              lang="xml"
              fontSize={fontSize}
              onHighlight={handleSqlPanelHighlight}
            />
          )}
        </div>
      </div>
```

- [ ] **Step 4: 빌드로 검증**

Run: `npx vite build`
Expected: 빌드 성공.

- [ ] **Step 5: 수동 스모크**

`npm run dev` → ACCT 비교 → 매퍼 호출 클릭 → 카드의 "전체 매퍼 보기" 클릭.
Expected: 우측에서 패널이 슬라이드되어 `AcctMapper.xml` 전체가 Shiki 하이라이트로 보이고, `<insert id="insertAccount">` 줄로 스크롤+노란 강조. ESC/×로 닫힌다.

- [ ] **Step 6: Commit**

```bash
git add src/CodeComparator.tsx
git commit -m "feat : CodeComparator 전체 매퍼 XML 슬라이드 패널" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 범례 문구 + 전체 검증 + 작업 기록

**Files:**
- Modify: `src/CodeComparator.tsx`
- Modify: `docs/한일/2026-06-18.md`

**Interfaces:**
- Consumes: 전체 기능
- Produces: PB5 패널 범례에 "SQL호출:대응" 안내, 최종 검증, 한일 기록

- [ ] **Step 1: PB5(오른쪽) 패널 범례 문구 추가**

`src/CodeComparator.tsx` 오른쪽 패널 헤더의 범례(1293행 근처) 한 줄:

```tsx
                <span className="text-[12px] opacity-60 mt-0.5">클릭:접기 | Alt+클릭:점프 | Shift+클릭:댓글</span>
```

를 다음으로 바꾼다:

```tsx
                <span className="text-[12px] opacity-60 mt-0.5">클릭:접기 | Alt+클릭:점프 | Shift+클릭:댓글 | SQL호출:대응</span>
```

(왼쪽 PB 패널 범례 1232행은 그대로 둔다 — SQL 대응은 PB5 쪽만 트리거.)

- [ ] **Step 2: 전체 단위테스트**

Run: `npx vitest run`
Expected: 기존 테스트 + `sqlLink` 13개 모두 PASS. (기존 빨강이 있던 스위트가 있으면 그 상태는 변동 없음 — 본 작업과 무관.)

- [ ] **Step 3: 전체 빌드**

Run: `npx vite build`
Expected: 빌드 성공.

- [ ] **Step 4: 작업 기록(docs/한일)**

`docs/한일/2026-06-18.md` 맨 아래에 이어서 추가:

```markdown

## PB5 매퍼 SQL 대응 보기 — 구현 완료

- 변경: PB5(Java) 매퍼 호출 줄 클릭 → 매퍼 XML SQL 을 끌어와 PB 인라인 EXEC SQL 과 대응 카드 + "전체 매퍼 보기" 슬라이드 패널.
- 구성: 순수로직 `src/sqlLink.ts`(detectMapperCall/findMapperStatement/extractEmbeddedSql/matchEmbeddedSql)+`test/sqlLink.test.ts`(13). `Link.ts`에 `resolveXmlByName` 추가. `CodeComparator.tsx` 클릭 분기+카드+패널+범례.
- 매칭: (verb, table) 키, 실패 시 추측 금지(토스트/카드 "못 찾음"). 트리거=오른쪽·langB==='java' plain 클릭(기존 접기/점프/댓글과 비충돌).
- 검증: `npx vitest run`(sqlLink 13 통과), `npx vite build` 성공, 수동 스모크(ACCT) 확인.
- 외부 API 변경: 없음(로컬 에셋 지연 로딩만).
```

- [ ] **Step 5: Commit**

```bash
git add src/CodeComparator.tsx docs/한일/2026-06-18.md
git commit -m "feat : SQL 대응 범례 안내 + 작업 기록" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage:**
- 트리거(PB5 Java plain 클릭) → Task 6. 카드(양쪽 스니펫) → Task 7. 전체 매퍼 패널(b) → Task 8. 모듈 분해(4 순수함수) → Task 1–4. `resolveXmlByName` → Task 5. 매칭 규칙/실패 처리 → Task 4 + Task 6(토스트). 테스트 → Task 1–4. 범례/검증/기록 → Task 9. 누락 없음.
- 스펙 "v1 제외"(옵션 a 자동 하이라이트, PB측 클릭, zzz SQL↔XML, bind 정규화, include 자동전개)는 계획에 포함하지 않음(의도적).

**2. Placeholder scan:** "TBD/TODO/적절히 처리" 없음. 모든 코드/명령/기대출력 구체값. 통과.

**3. Type consistency:** `MapperCall`/`SqlStatement`/`MapperStatement`/`SqlVerb` 정의(Task 1)와 사용(Task 2–4, 6) 일치. `matchEmbeddedSql` 반환형 `{ match, candidateCount }` 이 Task 6 구조분해와 일치. `resolveXmlByName` 반환 `{ content, path }` 가 Task 6 사용과 일치. `CodeBlockHandle.scrollToLine` 시그니처가 Task 8 호출과 일치. `sqlPeek.pb5StartLine`/`pb5FullContent` 가 카드(Task 7)·패널(Task 8)에서 일관. 통과.
