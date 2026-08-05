import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IChecklistRepository } from './port/out/checklist.repository.interface';
import { UpdateChecklistDto } from './port/in/update-checklist.dto';

const VALID_STATUS = new Set(['YES', 'NO', 'NA', 'HOLD', 'NONE']);

@Injectable()
export class ChecklistService {
  constructor(
    @Inject('CHECKLIST_REPOSITORY')
    private readonly repository: IChecklistRepository,
  ) {}

  async findAll(serviceId: string) {
    if (!serviceId || serviceId.trim() === '') {
      throw new BadRequestException('serviceId cannot be empty');
    }
    return await this.repository.findAllByService(serviceId);
  }

  async updateState(serviceId: string, checkPointId: number, dto: UpdateChecklistDto) {
    if (!serviceId || serviceId.trim() === '') {
      throw new BadRequestException('serviceId cannot be empty');
    }
    if (dto.status === undefined && dto.comment === undefined) {
      throw new BadRequestException('Nothing to update (status or comment required)');
    }
    if (dto.status !== undefined && !VALID_STATUS.has(dto.status)) {
      throw new BadRequestException(`invalid status: ${dto.status}`);
    }
    return await this.repository.upsertState(serviceId, checkPointId, dto);
  }

  // 모아보기 매트릭스 — 점검 항목(컬럼) + 프로그램별 상태 행으로 조립한다.
  async getMatrix() {
    const [checkPoints, cells] = await Promise.all([
      this.repository.findAllCheckPoints(),
      this.repository.findMatrixCells(),
    ]);
    const byProgram = new Map<string, any>();
    const order: string[] = [];
    for (const cell of cells) {
      if (!byProgram.has(cell.serviceId)) {
        byProgram.set(cell.serviceId, {
          serviceId: cell.serviceId,
          bigCategory: cell.bigCategory ?? null,
          middleCategory: cell.middleCategory ?? null,
          statuses: {} as Record<number, string>,
          comments: {} as Record<number, string>, // 의견은 있는 것만(sparse) — 2만 건 payload 절약
        });
        order.push(cell.serviceId);
      }
      const program = byProgram.get(cell.serviceId);
      program.statuses[cell.checkPointId] = cell.status;
      if (cell.comment) program.comments[cell.checkPointId] = cell.comment;
    }
    return { checkPoints, programs: order.map((id) => byProgram.get(id)) };
  }
}
