import { Module } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './port/in/checklist.controller';
import { ChecklistMatrixController } from './port/in/checklist-matrix.controller';
import { ChecklistRepository } from './port/out/checklist.repository';
import { MockChecklistRepository } from './port/out/mock-checklist.repository';
import { repositoryProvider } from '../common/repository.provider';

@Module({
  controllers: [ChecklistController, ChecklistMatrixController],
  providers: [
    ChecklistService,
    // PROFILE=MOCK → MockChecklistRepository, 그 외 → ChecklistRepository(Oracle)
    repositoryProvider('CHECKLIST_REPOSITORY', ChecklistRepository, MockChecklistRepository),
  ],
  exports: [ChecklistService],
})
export class ChecklistModule {}
