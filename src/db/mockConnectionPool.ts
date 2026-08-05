// PROFILE=MOCK 일 때 PoolSelector 가 고르는 "목 커넥션 풀" 구현체.
// 참고: MOCK 프로파일에서는 리포지토리도 인메모리 목(Mock*Repository)이라 실제로 이 풀을
// 거치지 않는다. 즉 이 스텁은 "DB 없이도 앱이 부팅되게 하는 안전장치" 역할이다.
const pools = new Map();

/**
 * 목 커넥션 풀을 초기화합니다. (실제 DB 연결 없음)
 * 애플리케이션 시작 시 main.ts 의 initPool() 에서 호출됩니다.
 */
export async function initPool() {
  const mockPool = {
    getConnection: async () => ({
      execute: async () => ({ rows: [] }),
      close: async () => {},
      commit: async () => {},
      rollback: async () => {},
      autoCommit: false,
    }),
    close: async () => { console.log("mock db pool [default] closed"); }
  };

  pools.set('default', mockPool);
  pools.set('metadata', { ...mockPool, close: async () => { console.log("mock db pool [metadata] closed"); } });
  
  console.log('[DB] Mock Connection Pool initialized');
}

/**
 * Oracle 커넥션 풀을 종료합니다.
 * 애플리케이션 종료 시 호출하여 리소스를 해제합니다.
 */
export async function closePool() {
  for (const pool of pools.values()) {
    await pool.close();
  }
  pools.clear();
}

export function getPool(name = 'default') {
  const pool = pools.get(name);
  if (!pool) {
    throw new Error(`Pool [${name}] not initialized`);
  }
  return pool;
}
