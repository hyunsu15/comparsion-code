import { Controller, Get, Patch, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ChecklistService } from '../../checklist.service';
import { UpdateChecklistDto } from './update-checklist.dto';

@Controller('services/:serviceId/checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  // 점검 항목 마스터 + 해당 프로그램 상태를 합쳐 반환.
  @Get()
  findAll(@Param('serviceId') serviceId: string) {
    return this.checklistService.findAll(serviceId);
  }

  // 점검 항목(check_point) 단위로 그 프로그램의 상태(완료여부/메모)를 갱신(업서트).
  @Patch(':checkPointId')
  update(
    @Param('serviceId') serviceId: string,
    @Param('checkPointId', ParseIntPipe) checkPointId: number,
    @Body() updateChecklistDto: UpdateChecklistDto,
  ) {
    return this.checklistService.updateState(serviceId, checkPointId, updateChecklistDto);
  }
}
