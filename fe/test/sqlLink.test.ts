import { describe, it, expect } from 'vitest';
import { detectMapperCall, findMapperStatement, extractEmbeddedSql, matchEmbeddedSql } from '../src/codeview/sqlLink';
import type { MapperStatement, SqlStatement } from '../src/codeview/sqlLink';

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

  it('한 줄짜리 DML(UPDATE)도 추출', () => {
    const r = extractEmbeddedSql('    EXEC SQL UPDATE account SET balance = :b WHERE acct_no = :id;');
    expect(r).toHaveLength(1);
    expect(r[0].verb).toBe('update');
    expect(r[0].table).toBe('account');
  });
});

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
