import { Injectable } from '@nestjs/common';
import { IServiceRepository } from './service.repository.interface';
import { CreateServiceDto } from '../in/create-service.dto';

@Injectable()
export class MockServiceRepository implements IServiceRepository {
  // 하나의 service_id가 pb/pb5 두 행(소스)을 가진다. file_name(프로그램ID)으로 프론트 로컬 에셋을 찾는다.
  //   - 구버전 에셋: code/<폴더>/ 안에 .pc + .java 동거 (a, b)
  //   - 새 폴더 구조: pb=code/c/**/*.pc, pb5=code/java/**/*-online/**/*.java|*.xml (ACCT001, ACCTMAP)
  private services: any[] = [
    { serviceId: 'a', bigCategory: '회원', middleCategory: '인증', codeKind: 'pb', fileName: 'gemini-code-1779930299661.pc' },
    // pb5는 간혹 file_name이 'Class.method' 형태로 온다 → 로드 후 그 메소드로 자동 점프(EmpProcess.processEmployee)
    { serviceId: 'a', bigCategory: '회원', middleCategory: '인증', codeKind: 'pb5', fileName: 'EmpProcess.processEmployee' },
    { serviceId: 'b', bigCategory: '계좌', middleCategory: '이체', codeKind: 'pb', fileName: 'gemini-code-1779930355226.pc' },
    { serviceId: 'b', bigCategory: '계좌', middleCategory: '이체', codeKind: 'pb5', fileName: 'gemini-code-1779930335141.java' },
    // 새 폴더 구조: ACCT001.pc ↔ AcctService.java (자바)
    { serviceId: 'ACCT001', bigCategory: '계좌', middleCategory: '신규', codeKind: 'pb', fileName: 'ACCT001.pc' },
    { serviceId: 'ACCT001', bigCategory: '계좌', middleCategory: '신규', codeKind: 'pb5', fileName: 'AcctService.java' },
    // 새 폴더 구조: ACCT001.pc ↔ AcctMapper.xml (xml 매퍼)
    { serviceId: 'ACCTMAP', bigCategory: '계좌', middleCategory: '쿼리매핑', codeKind: 'pb', fileName: 'ACCT001.pc' },
    { serviceId: 'ACCTMAP', bigCategory: '계좌', middleCategory: '쿼리매핑', codeKind: 'pb5', fileName: 'AcctMapper.xml' },
    // _APS 접미사 케이스: DB엔 접미사 없는 'ACCT002', 실제 파일은 ACCT002_APS.pc
    { serviceId: 'ACCT002', bigCategory: '계좌', middleCategory: '잔액조회', codeKind: 'pb', fileName: 'ACCT002' },
    { serviceId: 'ACCT002', bigCategory: '계좌', middleCategory: '잔액조회', codeKind: 'pb5', fileName: 'AcctService.java' },
  ];

  async create(dto: CreateServiceDto): Promise<any> {
    const existing = this.services.find(
      (s) => s.serviceId === dto.serviceId && s.codeKind === dto.codeKind,
    );
    if (existing) {
      existing.bigCategory = dto.bigCategory ?? null;
      existing.middleCategory = dto.middleCategory ?? null;
      existing.fileName = dto.fileName ?? null;
      return 1;
    }
    this.services.push({
      serviceId: dto.serviceId,
      bigCategory: dto.bigCategory ?? null,
      middleCategory: dto.middleCategory ?? null,
      codeKind: dto.codeKind,
      fileName: dto.fileName ?? null,
    });
    return 1;
  }

  async findAll(): Promise<any[]> {
    return [...this.services];
  }

  async findOne(serviceId: string): Promise<any[]> {
    return this.services.filter((s) => s.serviceId === serviceId);
  }

  async remove(serviceId: string): Promise<number> {
    const initialLength = this.services.length;
    this.services = this.services.filter((s) => s.serviceId !== serviceId);
    return initialLength - this.services.length;
  }
}
