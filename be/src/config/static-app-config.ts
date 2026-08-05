import { AppConfig } from './app-config.interface.js';
import type { OraclePoolConfigs, Profile } from './app-config.interface.js';

// 풀 공통 옵션 (createPool 에 그대로 전달)
const POOL_DEFAULTS = {
  poolMin: 5,
  poolMax: 20,
  poolIncrement: 2,
  poolTimeout: 60,
  poolPingInterval: 60,
  queueTimeout: 10000,
  stmtCacheSize: 50,
  enableStatistics: false,
} as const;

/**
 * 환경값을 코드에 직접 둔 "사용 예시" 구현체.
 * - .env 파일 없이 이 파일의 값으로 동작한다.
 * - isMock() 은 베이스(AppConfig)의 default 구현을 상속한다 → 여기선 profile 만 지정.
 */
export class StaticAppConfig extends AppConfig {
  readonly port = 50004;
  readonly profile: Profile = 'MOCK'; // 실제 Oracle 을 쓰려면 'DEFAULT' 로 바꾼다

  getOraclePoolConfigs(): OraclePoolConfigs | null {
    if (this.isMock()) return null;

    return {
      default: {
        user: 'scott',
        password: 'tiger',
        connectString: 'localhost:1521/xe',
        poolAlias: 'default',
        ...POOL_DEFAULTS,
      },
      metadata: {
        user: 'scott',
        password: 'tiger',
        connectString: 'localhost:1521/xe',
        poolAlias: 'metadata',
        ...POOL_DEFAULTS,
      },
    };
  }
}
