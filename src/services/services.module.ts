import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './port/in/services.controller';
import { ServiceRepository } from './port/out/service.repository';
import { MockServiceRepository } from './port/out/mock-service.repository';
import { repositoryProvider } from '../common/repository.provider';

@Module({
  controllers: [ServicesController],
  providers: [
    ServicesService,
    // PROFILE=MOCK → MockServiceRepository, 그 외 → ServiceRepository(Oracle)
    repositoryProvider('SERVICE_REPOSITORY', ServiceRepository, MockServiceRepository),
  ],
  exports: [ServicesService],
})
export class ServicesModule {}
