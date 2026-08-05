import { Controller, Get, Post, Body, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ServicesService } from '../../services.service';
import { CreateServiceDto } from './create-service.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':serviceId')
  findOne(@Param('serviceId') serviceId: string) {
    return this.servicesService.findOne(serviceId);
  }

  // 삭제 성공은 204 No Content. (멱등 — 이미 없는 서비스도 성공으로 본다)
  @Delete(':serviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('serviceId') serviceId: string) {
    return this.servicesService.remove(serviceId);
  }
}
