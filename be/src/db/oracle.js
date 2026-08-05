import oracledb from 'oracledb';

// Oracle 클라이언트 라이브러리 경로 설정 (필요한 경우)
// oracledb.initOracleClient({ libDir: 'C:\\instantclient_19_8' });
/**
 * Oracle 커넥션 풀 초기화
 */
export async function initOraclePool(dbConfig) {
  try {
    await oracledb.createPool(dbConfig);
    console.log('[DB] Oracle Connection Pool initialized');
  } catch (err) {
    console.error('[DB] Oracle Pool Initialization Error: ', err);
    throw err;
  }
}
