import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import { AppModule } from './app.module';
import { initPool, closePool } from './db/PoolSelector.js';
import { appConfig } from './config/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // 응답 압축(gzip) — 목록/긴 JSON(체크리스트 매트릭스 등) 전송 크기를 줄인다.
  app.use(compression());

  // 전역 입력 검증 — DTO(class-validator) 기준으로 검증하고 형식 오류는 400 으로 반환한다.
  //   whitelist: DTO 에 데코레이트되지 않은 속성은 제거(과잉 필드 차단)
  //   transform: 요청 바디를 DTO 클래스 인스턴스로 변환
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // PROFILE 에 맞는 커넥션 풀 초기화 (MOCK=인메모리, DEFAULT=Oracle).
  await initPool();

  // 종료 시 커넥션 풀을 정리한다(Oracle 풀의 graceful close).
  const shutdown = async (signal: string) => {
    console.log(`[APP] ${signal} 수신 — 커넥션 풀 정리 후 종료`);
    await closePool();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  const port = appConfig.port;
  await app.listen(port);
  console.log(`Application is running on: ${port}`);
}

// bootstrap 실패(풀 초기화 실패·포트 점유 등)를 잡아 unhandled rejection 으로 조용히 죽지 않게 한다.
bootstrap().catch((err) => {
  console.error('[APP] bootstrap failed', err);
  process.exit(1);
});
