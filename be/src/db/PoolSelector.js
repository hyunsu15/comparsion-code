import * as OraclePool from './OracleConnectionPool.js';
import * as MockPool from './mockConnectionPool.js';
import { appConfig } from '../config/index.js';

/**
 * PROFILE 에 따라 적절한 커넥션 풀 구현체를 선택한다.
 *   - MOCK        → 인메모리 목 풀 (DB 불필요)
 *   - DEFAULT     → 실제 Oracle 풀
 *
 * 선택을 "호출 시점"에 수행한다. (initPool/getPool 은 bootstrap 이후 호출됨)
 */
const selectPool = () => (appConfig.isMock() ? MockPool : OraclePool);

export const initPool = (...args) => selectPool().initPool(...args);
export const getPool = (...args) => selectPool().getPool(...args);
export const closePool = (...args) => selectPool().closePool(...args);
