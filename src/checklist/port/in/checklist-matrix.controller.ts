import { Controller, Get } from '@nestjs/common';
import { ChecklistService } from '../../checklist.service';

// 모아보기 대시보드용 — 전 프로그램 × 점검 항목 상태 매트릭스. (service 스코프 밖이라 별도 컨트롤러)
@Controller('checklist')
export class ChecklistMatrixController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get('matrix')
  getMatrix() {
    return this.checklistService.getMatrix();
  }
}
