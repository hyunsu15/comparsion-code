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
 * 실제 Oracle 을 사용하는 구현체 뼈대.
 * isMock() 은 베이스(AppConfig)의 default 구현을 상속한다.
 *
 * DB 접속정보 채우는 방법 (택1):
 *   1) 아래 값에 직접 박는다.            ← 간단하지만 비번이 코드/깃에 노출
 *   2) process.env 등 외부에서 읽어온다.  ← 운영 권장 (pm2 env / OS 환경변수로 주입)
 *        예) user: process.env.DB_USER ?? '',
 *
 * 사용하려면 config/index.ts 에서 new OracleAppConfig() 로 교체한다.
 */
export class OracleAppConfig extends AppConfig {
  readonly port = 50004;
  readonly profile: Profile = 'DEFAULT';

  getOraclePoolConfigs(): OraclePoolConfigs | null {
    if (this.isMock()) return null;

    return null;
  }
}
