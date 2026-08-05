import { UpdateChecklistDto } from '../in/update-checklist.dto';
import { ChecklistItem, CheckPointColumn, MatrixCell } from './checklist.entity';

export interface IChecklistRepository {
  // 점검 항목 마스터 전부 + 해당 프로그램 상태(LEFT JOIN).
  findAllByService(serviceId: string): Promise<ChecklistItem[]>;
  // (check_point_id, service_id) 업서트 — 상태 행이 없으면 만들고, 있으면 갱신. 영향 행 수 반환.
  upsertState(serviceId: string, checkPointId: number, dto: UpdateChecklistDto): Promise<number>;
  // 모아보기 매트릭스: 점검 항목(컬럼) + 프로그램×항목 셀
  findAllCheckPoints(): Promise<CheckPointColumn[]>;
  findMatrixCells(): Promise<MatrixCell[]>;
}
