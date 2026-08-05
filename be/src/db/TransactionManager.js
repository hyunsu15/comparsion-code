import { AsyncLocalStorage } from 'async_hooks';
import oracledb from 'oracledb';
import { appConfig } from '../config/index.js';
import { getPool } from './PoolSelector.js';

export const transactionStorage = new AsyncLocalStorage();

/**
 * 현재 트랜잭션의 커넥션을 가져옵니다.
 */
export function getConnection() {
  const connection = transactionStorage.getStore();

  if (!connection) {
    throw new Error('No active transaction context');
  }

  return connection;
}

/**
 * 트랜잭션 실행 (Propagation.REQUIRED)
 * - 기존 트랜잭션이 있으면 재사용
 * - 없으면 새로 생성
 * @param {Function} action 실행할 함수
 * @param {Object} opts 옵션 (poolName 등)
 */
export async function runInTransaction(action, opts = {}) {
  // MOCK 프로파일: 실제 트랜잭션/커넥션 없이 그대로 실행
  if (appConfig.isMock()) {
    return action();
  }

  const existingConnection = transactionStorage.getStore();

  // ✅ 기존 트랜잭션 참여
  if (existingConnection) {
    return action();
  }

  let connection;

  try {
    // ✅ 지정된 풀 이름(기본값 'default')으로 커넥션 획득
    connection = await getPool(opts.poolName || 'default').getConnection();

    // ✅ autocommit 명시 (안전성 확보)
    connection.autoCommit = false;

    return await transactionStorage.run(connection, async () => {
      const result = await action();

      await connection.commit();

      return result;
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('[DB] Rollback failed:', {
          error: rollbackError,
          originalError: error,
        });
      }
    }
    throw error;

  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('[DB] Connection close failed:', closeError);
      }
    }
  }
}
