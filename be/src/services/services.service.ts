import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IServiceRepository } from './port/out/service.repository.interface';
import { CreateServiceDto } from './port/in/create-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @Inject('SERVICE_REPOSITORY')
    private readonly repository: IServiceRepository,
  ) {}

  async create(dto: CreateServiceDto) {
    if (!dto.serviceId || dto.serviceId.trim() === '') {
      throw new BadRequestException('serviceId cannot be empty');
    }
    if (dto.serviceId.length > 10) {
      throw new BadRequestException('serviceId must be 10 characters or fewer');
    }
    if (dto.codeKind !== 'pb' && dto.codeKind !== 'pb5') {
      throw new BadRequestException('codeKind must be pb or pb5');
    }
    return await this.repository.create(dto);
  }

  async findAll() {
    return await this.repository.findAll();
  }

  async findOne(serviceId: string) {
    // 하나의 service_id는 pb/pb5 두 행(소스)을 가지므로 목록으로 반환
    const rows = await this.repository.findOne(serviceId);
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`Service '${serviceId}' not found`);
    }
    return rows;
  }

  async remove(serviceId: string) {
    return await this.repository.remove(serviceId);
  }
}
