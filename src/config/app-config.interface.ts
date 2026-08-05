/**
 * 앱 환경 설정 계약.
 * 구현체는 이 추상 클래스를 extends 하고 port / profile / getOraclePoolConfigs 만 구현하면 된다.
 * isMock() 은 default 구현을 제공한다(profile 로 판단) → 구현체에서 반복 구현 불필요.
 */
export type Profile = 'MOCK' | 'DEFAULT';

/** oracledb.createPool 에 그대로 전달되는 풀 설정 */
export interface OraclePoolConfig {
  user: string;
  password: string;
  connectString: string;
  poolAlias: string;
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  poolTimeout?: number;
  poolPingInterval?: number;
  queueTimeout?: number;
  stmtCacheSize?: number;
  enableStatistics?: boolean;
}

export interface OraclePoolConfigs {
  default: OraclePoolConfig;
  metadata: OraclePoolConfig;
}

export abstract class AppConfig {
  /** 서버 포트 */
  abstract readonly port: number;
  /** 실행 프로파일 (MOCK=인메모리, DEFAULT=실제 Oracle) */
  abstract readonly profile: Profile;
  /** Oracle 풀 설정. MOCK 이면 null (DB 불필요) */
  abstract getOraclePoolConfigs(): OraclePoolConfigs | null;

  /** MOCK 여부 — mock/실DB 분기는 전부 이 메서드로 판단한다 (default 구현) */
  isMock(): boolean {
    return this.profile === 'MOCK';
  }
}
