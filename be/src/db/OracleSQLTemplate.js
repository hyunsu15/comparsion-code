import oracledb from 'oracledb';
import { transactionStorage } from './TransactionManager.js';
import { getPool } from './PoolSelector.js';

/**
 * DB 실행 에러를 로깅합니다.
 */
const logError = (err, sql, binds) => {
  console.error('[DB] Execution Error:', {
    message: err.message,
    sql,
    binds,
    stack: err.stack,
  });
};

/**
 * SQL 실행 공통 함수
 * @param {string} sql SQL 쿼리문
 * @param {object|array} binds 바인드 변수
 * @param {object} opts 실행 옵션
 * @returns {Promise<any>} 조회 결과 rows 또는 실행 결과 객체
 */
export async function execute(sql, binds = [], opts = {}) {
  let conn;

  // AsyncLocalStorage에서 현재 트랜잭션 커넥션 획득
  const externalConn = transactionStorage.getStore();

  const options = {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    // 트랜잭션 컨텍스트가 있으면 autoCommit을 비활성화합니다.
    autoCommit: !externalConn,
    ...opts
  };

  try {
    // 트랜잭션 커넥션이 없으면 풀에서 새로 가져옵니다.
    conn = externalConn || await getPool(options.poolName || 'default').getConnection();

    const result = await conn.execute(sql, binds, options);

    // SELECT 결과(rows)가 있으면 rows를 반환하고, 아니면 결과 전체(rowsAffected 등)를 반환합니다.
    return result.rows !== undefined ? result.rows : result;

  } catch (err) {
    logError(err, sql, binds);
    throw err;

  } finally {
    // 직접 획득한 커넥션만 닫아 풀로 반환합니다.
    if (conn && !externalConn) {
      await conn.close().catch(err => console.error('[DB] Connection Close Error:', err));
    }
  }
}

/**
 * SQL 쿼리를 실행하고 RETURNING 절을 통해 생성된 ID를 반환합니다.
 * @param {string} sql SQL 쿼리문 (RETURNING 절 포함)
 * @param {object|array} binds 바인드 변수 (ID를 제외한 입력 값)
 * @param {string} idBindName RETURNING 절에서 사용할 ID 바인드 변수 이름
 * @param {object} opts 실행 옵션
 * @returns {Promise<number>} 생성된 ID 값
 */
export async function executeAndReturnId(sql, binds = {}, idBindName, opts = {}) {
  let conn;
  const externalConn = transactionStorage.getStore();

  const options = {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    autoCommit: !externalConn,
    ...opts
  };

  const allBinds = {
    ...binds,
    [idBindName]: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT,val:null }
  };

  try {
    conn = externalConn || await getPool(options.poolName || 'default').getConnection();
    const result = await conn.execute(sql, allBinds, options);
    if (result.outBinds && result.outBinds[idBindName] && result.outBinds[idBindName].length > 0) {
      return result.outBinds[idBindName][0];
    }
    throw new Error(`Failed to retrieve generated ID for bind name: ${idBindName}`);
  } catch (err) {
    logError(err, sql, allBinds);
    throw err;
  } finally {
    if (conn && !externalConn) {
      await conn.close().catch(err => console.error('[DB] Connection Close Error:', err));
    }
  }
}