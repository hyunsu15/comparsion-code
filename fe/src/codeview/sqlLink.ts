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

/**
 * 클릭한 Java 한 줄에서 매퍼 호출('receiver.method(')을 인식한다.
 * receiver 의 선언 타입이 '*Mapper' 일 때만 매퍼 호출로 인정(로컬/일반 호출 배제).
 * 인식 실패 시 null → 일반 클릭(무동작)로 둔다.
 */
export const detectMapperCall = (lineText: string, javaCode: string): MapperCall | null => {
  const callRe = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(lineText)) !== null) {
    const receiver = m[1];
    const methodName = m[2];
    const mapperType = findReceiverMapperType(javaCode, receiver);
    if (!mapperType) continue;
    return { receiver, methodName, mapperType, namespace: findMapperNamespace(javaCode, mapperType) };
  }
  return null;
};

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

/**
 * SQL 보기용 PB(.pc) 파일명 도출.
 * mapperType 에서 끝의 'Mapper'(대소문자 무시)를 떼어 pbsql 로 보고 '{prefix}_{pbsql}.pc' 를 만든다.
 * prefix(접두사, env 관리)가 비었거나 pbsql 이 비면 null(호출부가 토스트로 안내).
 *   pbSqlFileName('PB', 'AcctMapper') → 'PB_Acct.pc'   (pbsql 은 매칭 시 대소문자 무시)
 */
export const pbSqlFileName = (prefix: string, mapperType: string): string | null => {
  const p = prefix.trim();
  if (!p) return null;
  const pbsql = mapperType.trim().replace(/mapper$/i, '');
  if (!pbsql) return null;
  return `${p}${pbsql}.pc`;
};
