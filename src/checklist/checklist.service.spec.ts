import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistService } from './checklist.service';
import { MockChecklistRepository } from './port/out/mock-checklist.repository';

describe('ChecklistService', () => {
  let service: ChecklistService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistService,
        { provide: 'CHECKLIST_REPOSITORY', useClass: MockChecklistRepository },
      ],
    }).compile();

    service = module.get<ChecklistService>(ChecklistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('표준 점검 항목(마스터)을 모두 반환하고, 처음엔 전부 NONE(선택안함) 이다', async () => {
    const items = await service.findAll('a');
    expect(items.length).toBe(21);
    expect(items[0].checkPoint).toBe('기본 구조');
    expect(items.every((i) => i.status === 'NONE')).toBe(true);
  });

  it('upsert 로 status 를 바꾼다 (첫 호출은 상태 행 생성)', async () => {
    const [first] = await service.findAll('a');
    await service.updateState('a', first.checkPointId, { status: 'YES' });
    const after = (await service.findAll('a')).find((i) => i.checkPointId === first.checkPointId);
    expect(after?.status).toBe('YES');
  });

  it('프로그램별 상태는 격리된다 (a 변경이 b에 영향 없음)', async () => {
    const [first] = await service.findAll('a');
    await service.updateState('a', first.checkPointId, { status: 'NO' });
    const bItem = (await service.findAll('b')).find((i) => i.checkPointId === first.checkPointId);
    expect(bItem?.status).toBe('NONE');
  });

  it('잘못된 status 는 거부한다', async () => {
    await expect(service.updateState('a', 1, { status: 'BOGUS' as any })).rejects.toThrow();
  });

  it('NONE(선택안함)은 유효한 status 다 (저장됨)', async () => {
    const [first] = await service.findAll('a');
    await service.updateState('a', first.checkPointId, { status: 'NONE' });
    const after = (await service.findAll('a')).find((i) => i.checkPointId === first.checkPointId);
    expect(after?.status).toBe('NONE');
  });

  it('빈 패치(status/comment 둘 다 없음)는 거부한다', async () => {
    await expect(service.updateState('a', 1, {})).rejects.toThrow();
  });

  it('매트릭스: 점검 항목 컬럼 + 프로그램별 상태를 조립한다', async () => {
    await service.updateState('a', 1, { status: 'YES' });
    const matrix = await service.getMatrix();
    expect(matrix.checkPoints.length).toBe(21);
    expect(matrix.programs.length).toBeGreaterThanOrEqual(5);
    const a = matrix.programs.find((p: any) => p.serviceId === 'a');
    expect(a.statuses[1]).toBe('YES');
    const b = matrix.programs.find((p: any) => p.serviceId === 'b');
    expect(b.statuses[1]).toBe('NONE');
  });
});
