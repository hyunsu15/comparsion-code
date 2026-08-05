import type { AppConfig } from './app-config.interface.js';
import { StaticAppConfig } from './static-app-config.js';

/**
 * 앱 전역 환경 설정 싱글톤.
 * 구현체를 바꾸려면 이 한 줄만 교체한다.
 *
 * 현재: StaticAppConfig(profile='MOCK') — DB 없이 인메모리 목 리포지토리로 부팅된다.
 * 실제 Oracle 로 붙이려면:
 *   1) 구현체의 profile 을 'DEFAULT' 로 바꾸고
 *   2) getOraclePoolConfigs() 가 실제 접속정보(process.env 주입 권장)를 반환하도록 채운 뒤
 *   3) 이 줄을 그 구현체로 교체한다. (OracleAppConfig 는 아직 접속정보 미완성 스켈레톤)
 */
export const appConfig: AppConfig = new StaticAppConfig();

export type {
  AppConfig,
  Profile,
  OraclePoolConfig,
  OraclePoolConfigs,
} from './app-config.interface.js';
