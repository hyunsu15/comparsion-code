import { Injectable } from '@nestjs/common';
import { IServiceRepository } from './service.repository.interface';
import { CreateServiceDto } from '../in/create-service.dto';
import { SQLTemplate } from '../../../db/SQLTemplate.js';

// 조회 시 공통으로 사용하는 컬럼 목록 (DB snake_case → camelCase 별칭)
const SERVICE_COLUMNS = `
  service_id      as "serviceId",
  big_category    as "bigCategory",
  middle_category as "middleCategory",
  code_kind       as "codeKind",
  file_name       as "fileName"
`;

@Injectable()
export class ServiceRepository extends SQLTemplate implements IServiceRepository {
  async create(dto: CreateServiceDto): Promise<any> {
    const sql = `
      INSERT INTO comparsion_services
        (service_id, big_category, middle_category, code_kind, file_name)
      VALUES
        (:serviceId, :bigCategory, :middleCategory, :codeKind, :fileName)
    `;
    return await super.update(sql, {
      serviceId: dto.serviceId,
      bigCategory: dto.bigCategory ?? null,
      middleCategory: dto.middleCategory ?? null,
      codeKind: dto.codeKind,
      fileName: dto.fileName ?? null,
    });
  }

  async findAll(): Promise<any[]> {
    const sql = `
      SELECT ${SERVICE_COLUMNS}
      FROM comparsion_services
      ORDER BY big_category, middle_category, service_id, code_kind`;
    return await this.selectList(sql);
  }

  async findOne(serviceId: string): Promise<any[]> {
    // 하나의 service_id는 pb/pb5 두 행(소스)을 가지므로 목록으로 반환
    const sql = `
      SELECT ${SERVICE_COLUMNS}
      FROM comparsion_services
      WHERE service_id = :serviceId
      ORDER BY code_kind`;
    return await this.selectList(sql, { serviceId });
  }

  async remove(serviceId: string): Promise<number> {
    const sql = `DELETE FROM comparsion_services WHERE service_id = :serviceId`;
    return await super.update(sql, { serviceId });
  }
}
