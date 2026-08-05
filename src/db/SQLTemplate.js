import { execute, executeAndReturnId } from './OracleSQLTemplate.js';

/**
 * SQLTemplate 클래스
 * OracleSQLTemplate의 execute 함수를 래핑하여 리포지토리에서 사용하기 쉬운 상위 수준의 API를 제공합니다.
 */
export class SQLTemplate {
  /**
   * SQLTemplate은 이제 OracleSQLTemplate의 execute 함수를 직접 사용합니다.
   * 따라서 생성자에서 별도의 DB 인스턴스를 주입받을 필요가 없습니다.
   */
  constructor() {}

  /**
   * 다건 조회를 수행합니다.
   * @returns {Promise<Array>} 조회 결과 배열
   */
  async selectList(sql, binds = {}, opts = {}) {
    const result = await execute(sql, binds, opts);
    return Array.isArray(result) ? result : [];
  }

  /**
   * 단건 조회를 수행합니다.
   * @returns {Promise<Object|null>} 조회 결과 객체 또는 null
   */
  async selectOne(sql, binds = {}, opts = {}) {
    const rows = await execute(sql, binds, opts);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0];
    }
    return null;
  }

  /**
   * INSERT, UPDATE, DELETE 작업을 수행합니다.
   * @returns {Promise<number>} 영향을 받은 행의 수 (rowsAffected)
   */
  async update(sql, binds = {}, opts = {}) {
    const result = await execute(sql, binds, opts);
    // result가 rows가 아닌 oracledb 결과 객체인 경우 rowsAffected 반환
    return result.rowsAffected !== undefined ? result.rowsAffected : 0;
  }

  /**
   * INSERT 작업을 수행하고 결과를 반환합니다.
   * @returns {Promise<Object>} 실행 결과 (lastRowid 등 포함)
   */
  async insert(sql, binds = {}, opts = {}) {
    return await execute(sql, binds, opts);
  }

  /**
   * 대량의 데이터를 배치 처리할 때 사용합니다. (executeMany 활용 가능 구조)
   * @param {string} sql 
   * @param {Array<Object|Array>} bindDefs 
   */
  async batchUpdate(sql, bindDefs, opts = {}) {
    const options = {
      ...opts,
      batchErrors: true,
      autoCommit: opts.connection ? false : true
    };
    return await execute(sql, bindDefs, options);
  }

  /**
   * INSERT 작업을 수행하고 생성된 ID를 반환합니다.
   * SQL 쿼리는 반드시 'RETURNING [ID_COLUMN_NAME] INTO :[ID_BIND_NAME]'와 같은 형태로 ID를 반환하도록 작성되어야 합니다.
   * @param {string} sql SQL 쿼리문 (RETURNING 절 포함)
   * @param {object} binds 바인드 변수 (ID를 제외한 입력 값)
   * @param {string} idBindName RETURNING 절에서 사용할 ID 바인드 변수 이름 (기본값: 'out_id')
   * @returns {Promise<number>} 생성된 ID 값
   */
  async insertAndReturnId(sql, binds = {}, idBindName = 'out_id') {
    // OracleSQLTemplate의 executeAndReturnId 함수를 호출하여 ID를 반환받습니다.
    return await executeAndReturnId(sql, binds, idBindName);
  }
}
