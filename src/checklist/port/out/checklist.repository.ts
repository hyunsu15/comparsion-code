import { Injectable } from '@nestjs/common';
import { IChecklistRepository } from './checklist.repository.interface';
import { UpdateChecklistDto } from '../in/update-checklist.dto';
import { ChecklistItem, CheckPointColumn, MatrixCell } from './checklist.entity';
import { SQLTemplate } from '../../../db/SQLTemplate.js';
import { KST_NOW } from '../../../common/sql-expressions.js';

@Injectable()
export class ChecklistRepository extends SQLTemplate implements IChecklistRepository {
  async findAllByService(serviceId: string): Promise<ChecklistItem[]> {
    // 마스터(check_point) 전부 + 해당 프로그램 상태(LEFT JOIN). 상태가 없으면 'NONE'(선택안함)/메모 null.
    const sql = `
      SELECT cp.id          as "checkPointId",
             cp.check_point as "checkPoint",
             cp.detail      as "detail",
             cp.sort_order  as "sortOrder",
             NVL(cl.status, 'NONE') as "status",
             cl.comment_text as "comment",
             cl.update_date  as "updateDate"
      FROM comparsion_check_point cp
      LEFT JOIN comparsion_check_list cl
        ON cl.check_point_id = cp.id AND cl.service_id = :serviceId
      ORDER BY cp.sort_order, cp.id`;
    return await this.selectList(sql, { serviceId });
  }

  async upsertState(serviceId: string, checkPointId: number, dto: UpdateChecklistDto): Promise<number> {
    // 넘어온 필드만 갱신(COALESCE), 상태 행이 없으면 INSERT. update_date 는 항상 KST.
    const sql = `
      MERGE INTO comparsion_check_list cl
      USING (SELECT :checkPointId AS check_point_id, :serviceId AS service_id FROM dual) src
      ON (cl.check_point_id = src.check_point_id AND cl.service_id = src.service_id)
      WHEN MATCHED THEN UPDATE SET
        status       = COALESCE(:status, cl.status),
        comment_text = COALESCE(:commentText, cl.comment_text),
        update_date  = ${KST_NOW}
      WHEN NOT MATCHED THEN
        INSERT (check_point_id, service_id, status, comment_text, update_date)
        VALUES (src.check_point_id, src.service_id, NVL(:status, 'NONE'), :commentText, ${KST_NOW})`;
    return await super.update(sql, {
      checkPointId,
      serviceId,
      status: dto.status ?? null,
      // ⚠️ 바인드명 :comment 는 Oracle 예약어(COMMENT) → ORA-01745. :commentText 로 회피.
      commentText: dto.comment ?? null,
    });
  }

  async findAllCheckPoints(): Promise<CheckPointColumn[]> {
    const sql = `
      SELECT id AS "checkPointId", check_point AS "checkPoint", detail AS "detail"
      FROM comparsion_check_point
      ORDER BY sort_order, id`;
    return await this.selectList(sql);
  }

  async findMatrixCells(): Promise<MatrixCell[]> {
    // 프로그램(distinct service_id) × 점검 항목 교차곱 + 상태/의견(LEFT JOIN, 상태 없으면 NONE).
    const sql = `
      SELECT s.service_id      AS "serviceId",
             s.big_category    AS "bigCategory",
             s.middle_category AS "middleCategory",
             cp.id             AS "checkPointId",
             NVL(cl.status, 'NONE') AS "status",
             cl.comment_text   AS "comment"
      FROM (SELECT service_id, MAX(big_category) big_category, MAX(middle_category) middle_category
            FROM comparsion_services GROUP BY service_id) s
      CROSS JOIN comparsion_check_point cp
      LEFT JOIN comparsion_check_list cl
        ON cl.check_point_id = cp.id AND cl.service_id = s.service_id
      ORDER BY s.big_category, s.middle_category, s.service_id, cp.sort_order, cp.id`;
    return await this.selectList(sql);
  }
}
