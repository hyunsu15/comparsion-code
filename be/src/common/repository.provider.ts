import type { Provider, Type } from '@nestjs/common';
import { appConfig } from '../config/index.js';

/**
 * PROFILE 에 따라 리포지토리 구현을 골라 주입하는 NestJS provider 를 생성한다.
 *   - MOCK     → 인메모리 목 리포지토리 (DB 불필요)
 *   - DEFAULT  → 실제 Oracle 리포지토리
 *
 * 모든 feature 모듈은 이 헬퍼 하나만 쓴다 → mock/실DB 분기 로직을 한 곳에 모은다.
 *
 * @example
 *   providers: [
 *     ServicesService,
 *     repositoryProvider('SERVICE_REPOSITORY', ServiceRepository, MockServiceRepository),
 *   ]
 */
export function repositoryProvider(
  token: string,
  RealRepository: Type<unknown>,
  MockRepository: Type<unknown>,
): Provider {
  return {
    provide: token,
    useFactory: () =>
      appConfig.isMock() ? new MockRepository() : new RealRepository(),
  };
}
