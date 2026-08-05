# PB5 매퍼 SQL 대응 보기 — 설계 (PB ↔ PB5 SQL 검증)

작성일: 2026-06-18

## 1. 배경 / 목표

이 도구는 PB(Pro\*C, `.pc`) → PB5(Java + MyBatis) 마이그레이션을 **검증**한다.
검증에서 가장 중요한 대상 중 하나가 **SQL 정확성**인데, 현재 구조에는 사각지대가 있다.

- **PB(`.pc`)** 는 SQL이 함수 안에 인라인으로 박혀 있다 → 왼쪽 패널에서 그대로 보인다.
  예) `process_account` 안의 `EXEC SQL INSERT INTO account ...`
- **PB5(`.java`)** 는 SQL이 코드에 없다. `acctMapper.insertAccount(account)` 호출만 있고,
  실제 SQL은 **별도 파일 `AcctMapper.xml`** 의 `<insert id="insertAccount">` 에 있다.
- 그런데 '서비스' 비교에서 오른쪽 패널은 `AcctService.java` 만 로드한다 →
  **PB5의 SQL은 화면 어디에도 보이지 않는다.**

**목표:** PB5 Java의 매퍼 호출을 클릭하면, 숨은 매퍼 XML의 해당 SQL을 끌어와
**PB 원본 인라인 SQL과 나란히 대응**시켜 보여 준다. 검증자가 "옮긴 SQL이 원본과 같은가?"를 한 자리에서 판단할 수 있게 한다.

## 2. 범위

### v1 포함
- PB5(오른쪽, `langB === 'java'`) 매퍼 호출 줄 클릭 → **SQL 대응 카드** 표시
  (상단: PB 원본 `EXEC SQL` 스니펫 / 하단: PB5 매퍼 구문 스니펫)
- 카드의 **"전체 매퍼 보기"** 버튼 → 우측 슬라이드 패널에 **매퍼 XML 파일 전체**를 띄우고
  해당 구문으로 스크롤 + 하이라이트 (= 합의된 옵션 b)
- 매칭/해석 실패 시 **정직한 안내**(추측 금지)

### v1 제외 (향후)
- (a) 클릭 시 왼쪽 PB 패널 자동 스크롤+하이라이트 — 저비용이나 v1에서 제외하기로 합의
- PB(왼쪽) 쪽에서 클릭으로 SQL을 여는 동작 (PB는 SQL이 인라인이라 별도 타깃이 없음)
- 'zzz' 분류의 SQL 파일 직접 비교(`.sql` ↔ `.xml`) — 이미 양쪽이 화면에 보이는 케이스
- bind 변수 정규화 비교(`:v_acct_no` ↔ `#{acctNo}`)
- `<include refid>` / `<sql>` 조각의 자동 인라인 전개 (전체 파일 패널로 사람이 확인)

## 3. 대상 시나리오 (구체 예시)

- 왼쪽(PB): `code/c/banking/acct/ACCT001.pc`
  ```c
  void process_account(char* acct_no, double balance) {
      ...
      EXEC SQL INSERT INTO account (acct_no, balance, interest)
          VALUES (:v_acct_no, :v_balance, :v_interest);
  }
  ```
- 오른쪽(PB5): `code/java/banking/acct-online/com/example/acct/AcctService.java`
  ```java
  int affected = acctMapper.insertAccount(account);   // ← 이 줄 클릭
  ```
- 끌어올 파일: `code/java/banking/acct-online/mapper/AcctMapper.xml`
  ```xml
  <insert id="insertAccount" parameterType="com.example.acct.Account">
      INSERT INTO account (acct_no, balance, interest)
      VALUES (#{acctNo}, #{balance}, #{interest})
  </insert>
  ```

## 4. 사용자 인터랙션 (트리거)

- **plain 클릭**을 재사용한다. 매퍼 호출 줄은 메소드 시작 줄이 아니라 현재 클릭해도
  아무 동작이 없으므로(접기 대상 아님) 기존 동작과 **충돌하지 않는다.**
- 적용 조건: `side === 'B'` 그리고 `langB === 'java'` 그리고 클릭 줄이 메소드 시작 줄이 아님
  그리고 `detectMapperCall` 이 매퍼 호출을 인식했을 때.
- 기존 Alt(좌우 점프)·Shift(댓글)·메소드줄 클릭(접기)·마커 클릭(스레드)은 그대로 둔다.
- 발견성(UX): 오른쪽 패널 헤더 범례에 `SQL호출 클릭:대응 SQL` 추가, 매퍼 호출 줄 hover 시 밑줄 표시.

## 5. 아키텍처 — 모듈 분해

순수 로직은 React/DOM 비의존 모듈로 분리해 단위테스트한다(`methodJump.ts`·`codeSearch.ts` 와 동일 방침).
타입은 strict로 명시하고 `as any` 등을 쓰지 않는다. 가드 절(early return)로 들여쓰기를 낮춘다.

### 5.1 새 파일 `src/sqlLink.ts` (순수함수)

```ts
export type SqlVerb = 'select' | 'insert' | 'update' | 'delete';

export interface MapperCall {
  receiver: string;          // 'acctMapper'
  methodName: string;        // 'insertAccount'
  mapperType: string;        // 'AcctMapper'
  namespace: string | null;  // 'com.example.acct.AcctMapper' (import에서 도출, 없으면 null)
}

export interface SqlStatement {
  verb: SqlVerb;
  table: string | null;      // 'account' (best-effort)
  startLine: number;         // 1-base
  endLine: number;
  sqlText: string;
}

export interface MapperStatement extends SqlStatement {
  id: string;                // 'insertAccount'
}

// 클릭한 Java 한 줄 + 파일 전체에서 매퍼 호출을 인식한다.
//  - 'receiver.method(' 패턴을 찾고, receiver 의 선언 타입이 '*Mapper' 일 때만 인정.
//  - 매퍼 호출이 아니면 null → 일반 클릭(무동작)로 둔다.
export const detectMapperCall = (lineText: string, javaCode: string): MapperCall | null => { /* ... */ };

// XML 전체에서 statement id 한 건의 블록(줄범위/verb/table/sql)을 찾는다.
export const findMapperStatement = (xml: string, id: string): MapperStatement | null => { /* ... */ };

// PB(.pc)의 EXEC SQL DML 블록 목록. CONNECT/COMMIT/ROLLBACK/DECLARE/INCLUDE 등 비-DML 제외.
export const extractEmbeddedSql = (pcCode: string): SqlStatement[] => { /* ... */ };

// 매퍼 구문에 대응하는 PB 인라인 SQL을 (verb, table) 키로 찾는다.
//  - 0건 → match=null, 1건 → 그것, 다건 → 첫 건 + candidateCount 로 모호성 노출.
export const matchEmbeddedSql = (
  target: MapperStatement,
  candidates: SqlStatement[],
): { match: SqlStatement | null; candidateCount: number } => { /* ... */ };
```

### 5.2 `src/Link.ts` 에 추가 (기존 시그니처 불변, export만 추가)

```ts
// 에셋 인덱스에서 '<name>.xml' 을 찾아 지연 로딩한다. (lang === 'xml' 만 대상)
//   예) resolveXmlByName('AcctMapper') → { content, path } | null
export async function resolveXmlByName(
  name: string,
): Promise<{ content: string; path: string } | null> { /* ... */ }
```

- 구현 메모: 현 `indexByKind.pb5` 는 키당 자산 1개(java 또는 xml 혼재)라 xml 보장이 안 된다.
  xml 전용 인덱스를 별도로 만들거나(`name`, `name.xml` 키), `modules` 에서 `<name>.xml` 경로를 직접 찾는다.

## 6. 데이터 흐름 (클릭 → 표시)

1. 클릭 줄 텍스트 = `codeB.split('\n')[lineNum - 1]`.
2. `detectMapperCall(lineText, codeB)` → `call`. null이면 종료(무동작).
3. `resolveXmlByName(call.mapperType)` → `xml`. null이면 토스트 후 종료.
4. `findMapperStatement(xml.content, call.methodName)` → `stmt`. null이면 토스트 후 종료.
5. `extractEmbeddedSql(codeA)` → `matchEmbeddedSql(stmt, …)` → `{ match, candidateCount }`.
6. `setSqlPeek({ methodName, pb5:{fileName, stmt}, pb:{match, candidateCount}, x, y })`.

## 7. 렌더링

### 7.1 SQL 대응 카드 (기존 스레드 팝오버 오버레이 패턴 재사용)
클릭 위치(`x,y`)에 플로팅 카드. 드래그 이동·ESC/바깥클릭 닫기 등 기존 오버레이 동작과 일관.
- **상단 — PB 원본 SQL**: `match` 의 `sqlText` 스니펫 + `📄 {fileNameA} · L{startLine}`.
  `match` 가 없으면 `대응되는 PB 원본 SQL을 찾지 못했습니다` 표시(추측 금지).
- **하단 — PB5 매퍼 SQL**: `stmt.sqlText` 스니펫 + `📄 {pb5.fileName}` + `[전체 매퍼 보기]` 버튼.
- `candidateCount > 1` 이면 상단에 `대응 후보 {n}건` 배지.
- 스니펫은 가벼운 `<pre>` 하이라이트(기존 메시지 코드블록 스타일 재사용). 폴딩 등 불필요.

### 7.2 전체 매퍼 XML 패널 (옵션 b — 체크리스트 슬라이드 패널 패턴 재사용)
- 카드의 `[전체 매퍼 보기]` → `setSqlPanelXml({ fileName, content, line: stmt.startLine })`.
- 우측에서 슬라이드되는 패널에 `CodeBlock`(`lang="xml"`)로 **파일 전체**를 렌더하고
  `stmt.startLine` 으로 스크롤 + 하이라이트(`scrollToLine` 재사용).
- `<include>`/`<sql>` 조각·`resultMap` 등 스니펫만으로는 불완전한 부분을 사람이 직접 확인하는 통로.

### 7.3 상태 (CodeComparator)
```ts
const [sqlPeek, setSqlPeek] = useState<SqlPeek | null>(null);
const [sqlPanelXml, setSqlPanelXml] = useState<{ fileName: string; content: string; line: number } | null>(null);
```

## 8. 매칭 규칙 & 실패 처리 (SQL은 틀리느니 "못 찾음")

| 상황 | 처리 |
|---|---|
| 매퍼 호출 아님 | 무동작 (일반 클릭) |
| 매퍼 XML 못 찾음 | 토스트: `관련 매퍼 XML({mapperType})을 찾지 못했습니다` |
| XML에 구문 id 없음 | 토스트: `매퍼에 {methodName} 구문이 없습니다` |
| PB 대응 0건 | 카드 상단에 "못 찾음" 안내, PB5는 정상 표시 |
| PB 대응 다건 | 첫 건 표시 + `대응 후보 {n}건` 배지 (임의 확정하지 않음) |

- 매칭 키는 `(verb, table)`. table은 best-effort 추출:
  insert=`INTO (\w+)`, update=`UPDATE (\w+)`, delete=`DELETE FROM (\w+)`, select=`FROM (\w+)`.
- table을 못 뽑으면 verb만으로 후보를 좁히되, 모호하면 다건으로 노출(확정 금지).

## 9. 테스트 계획 (`test/sqlLink.test.ts`, node 환경)

- `detectMapperCall`: 정상(`acctMapper.insertAccount(...)`), 로컬호출(`calculateInterest(...)`)→null,
  receiver가 Mapper 아님→null, 체이닝/공백/세미콜론 변형.
- `findMapperStatement`: insert/select/update/delete, 없는 id→null, 동적SQL(`<if>`) 포함, table 추출.
- `extractEmbeddedSql`: 인라인 DML 추출, 비-DML(CONNECT/COMMIT/DECLARE/INCLUDE) 제외, 멀티라인.
- `matchEmbeddedSql`: 0건/1건/다건, table 없는 경우.
- 통합 1건: ACCT001.pc + AcctMapper.xml 샘플로 `insertAccount` ↔ `INSERT INTO account` 매칭.
- 검증은 "출력 행동"으로(반환 구조/값). 커버리지 채우기용 문자열 검증 금지.

## 10. 영향 범위 / 변경 파일

- **신규**: `src/sqlLink.ts`, `test/sqlLink.test.ts`
- **수정(추가만, 기존 public 시그니처 불변)**:
  - `src/Link.ts` — `resolveXmlByName` export 추가
  - `src/CodeComparator.tsx` — 클릭 핸들러 분기 1개 + `sqlPeek`/`sqlPanelXml` 상태·카드·패널·범례 문구
- 2-pane 레이아웃·기존 기능(접기/점프/댓글/검색/체크리스트/동기스크롤) 변경 없음.

## 11. 가이드 준수 체크

- 코딩가이드: 가드 절로 들여쓰기≤3, 순수함수 분리, strict 타입, 안 쓰는 코드/의존성 미생성.
- 리팩토링가이드: 기존 public/export 시그니처 보존(추가만).
- 테스트가이드: 엣지(빈/null/경계/비정상 경로) 우선, 외부 경계만 의존, 내부 mocking 금지.
- REST/성능: 서버 호출 없음(로컬 에셋 지연 로딩 1회). 외부 API 변경 없음.
- UX: 즉각 피드백(토스트), 오류 자체보다 사유 안내, ESC/바깥클릭 닫기 일관성, 추측 금지.

## 12. 미해결 질문

현재 없음. (구현 단계에서 `resolveXmlByName` 의 xml 인덱스 구성 방식만 확정)
