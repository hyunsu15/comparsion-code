import oracledb from 'oracledb';
import { appConfig } from '../config/index.js';
import { initOraclePool } from './oracle.js';

const pools = new Map();

export async function initPool() {
  const poolConfigs = appConfig.getOraclePoolConfigs();
  if (!poolConfigs) {
    console.log('[DB] Oracle Connection Pool skipped in MOCK profile');
    return;
  }

  // CLOB(content)을 Lob 객체가 아닌 문자열로 받는다.
  // 미설정 시 oracledb가 CLOB을 Lob(내부에 connection 참조 포함)으로 반환 →
  // 컨트롤러 응답 res.json() 직렬화에서 순환참조(Converting circular structure to JSON) 발생.
  oracledb.fetchAsString = [oracledb.CLOB];

  await initOraclePool(poolConfigs.default);
  pools.set('default', oracledb.getPool('default'));

  await initOraclePool(poolConfigs.metadata);
  pools.set('metadata', oracledb.getPool('metadata'));
}

export async function closePool() {
  try {
    for (const [name, pool] of pools.entries()) {
      await pool.close(30);
      console.log(`[DB] Oracle Connection Pool [${name}] closed`);
    }
    pools.clear();
  } catch (err) {
    console.error('[DB] Pool Close Error:', err);
  }
}

export function getPool(name = 'default') {
  const pool = pools.get(name);
  if (!pool) {
    throw new Error(`Pool [${name}] not initialized`);
  }
  return pool;
}
