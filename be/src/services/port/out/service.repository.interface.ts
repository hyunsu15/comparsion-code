import { CreateServiceDto } from '../in/create-service.dto';

export interface IServiceRepository {
  create(dto: CreateServiceDto): Promise<any>;
  findAll(): Promise<any[]>;
  findOne(serviceId: string): Promise<any[]>;
  remove(serviceId: string): Promise<number>;
}
