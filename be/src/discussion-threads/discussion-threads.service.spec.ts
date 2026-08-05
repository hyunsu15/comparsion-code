import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionThreadsService } from './discussion-threads.service';
import { MockDiscussionThreadRepository } from './port/out/mock-discussion-thread.repository';
import { ServicesService } from '../services/services.service';
import { MockServiceRepository } from '../services/port/out/mock-service.repository';

describe('DiscussionThreadsService', () => {
  let service: DiscussionThreadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionThreadsService,
        { provide: 'DISCUSSION_THREAD_REPOSITORY', useClass: MockDiscussionThreadRepository },
        ServicesService,
        { provide: 'SERVICE_REPOSITORY', useClass: MockServiceRepository },
      ],
    }).compile();

    service = module.get<DiscussionThreadsService>(DiscussionThreadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create (스레드 생성 — opinion_type 필수)', () => {
    const CONTENT = '새 토론 내용';

    it('정상 유형으로 스레드를 생성하고 유형을 저장한다', async () => {
      const id = await service.create(CONTENT, 'a', 'pb5', '홍길동', 'pb5', 42, 'MISMATCH');
      const thread = await service.findOne(id);
      expect(thread.opinionType).toBe('MISMATCH');
    });

    it('opinionType 이 없으면 BadRequest', async () => {
      await expect(
        service.create(CONTENT, 'a', 'pb5', '홍길동', 'pb5', 42, undefined as never),
      ).rejects.toThrow();
    });

    it('빈 문자열 opinionType 은 BadRequest', async () => {
      await expect(
        service.create(CONTENT, 'a', 'pb5', '홍길동', 'pb5', 42, '' as never),
      ).rejects.toThrow();
    });

    it('허용되지 않은 opinionType 은 BadRequest', async () => {
      await expect(
        service.create(CONTENT, 'a', 'pb5', '홍길동', 'pb5', 42, 'INVALID' as never),
      ).rejects.toThrow();
    });

    it('유형 검증 실패 시 스레드가 생성되지 않는다(부수효과 없음)', async () => {
      const before = (await service.findAll()).length;
      await expect(
        service.create(CONTENT, 'a', 'pb5', '홍길동', 'pb5', 42, 'INVALID' as never),
      ).rejects.toThrow();
      const after = (await service.findAll()).length;
      expect(after).toBe(before);
    });
  });

  describe('findAllPaged (분류별/글로벌 전체 + 페이징)', () => {
    // 비-RESOLVED 시드: id5(b), id4(a), id2(b), id1(a) — id DESC
    // mock 서비스: a=회원/인증, b=계좌/이체, ACCT*=계좌/...
    it('글로벌(분류 없음) 1페이지(size2) 최신순', async () => {
      const res = await service.findAllPaged({ page: 1, size: 2 });
      expect(res.items.map((t) => t.id)).toEqual([5, 4]);
      expect(res.totalCount).toBe(4);
      expect(res.page).toBe(1);
      expect(res.size).toBe(2);
    });

    it('글로벌 2페이지', async () => {
      const res = await service.findAllPaged({ page: 2, size: 2 });
      expect(res.items.map((t) => t.id)).toEqual([2, 1]);
    });

    it('RESOLVED 제외', async () => {
      const res = await service.findAllPaged({ page: 1, size: 100 });
      expect(res.items.some((t) => t.id === 3)).toBe(false);
    });

    it('opinionType 필터', async () => {
      const res = await service.findAllPaged({ opinionType: 'OMISSION', page: 1, size: 100 });
      expect(res.items.map((t) => t.id)).toEqual([5]);
      expect(res.totalCount).toBe(1);
    });

    it('대분류(회원)는 serviceId a 로 해석 → id 4,1', async () => {
      const res = await service.findAllPaged({ bigCategory: '회원', page: 1, size: 100 });
      expect(res.items.map((t) => t.id)).toEqual([4, 1]);
      expect(res.totalCount).toBe(2);
    });

    it('대분류(계좌)는 b 포함 → id 5,2', async () => {
      const res = await service.findAllPaged({ bigCategory: '계좌', page: 1, size: 100 });
      expect(res.items.map((t) => t.id)).toEqual([5, 2]);
    });

    it('매칭 프로그램이 없으면 빈 결과(404 아님)', async () => {
      const res = await service.findAllPaged({ bigCategory: '회원', middleCategory: '이체', page: 1, size: 20 });
      expect(res).toEqual({ items: [], page: 1, size: 20, totalCount: 0 });
    });
  });
});
