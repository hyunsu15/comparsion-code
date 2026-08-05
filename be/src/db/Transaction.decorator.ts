import { runInTransaction } from './TransactionManager.js';

/**
 * 메서드 실행 시 트랜잭션을 자동으로 시작하고 종료(Commit/Rollback)하는 데코레이터입니다.
 * AsyncLocalStorage 기반의 TransactionManager를 사용합니다.
 * 
 * @param opts 트랜잭션 옵션 (poolName 등)
 */
export function Transactional(opts: { poolName?: string } = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 기존 runInTransaction 로직에 현재 메서드 실행을 위임합니다.
      return await runInTransaction(() => originalMethod.apply(this, args), opts);
    };

    return descriptor;
  };
}