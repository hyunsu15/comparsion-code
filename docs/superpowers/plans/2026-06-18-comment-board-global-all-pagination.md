# 의견 모아보기 — 전체 보기 + 페이징 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 의견 모아보기에 "분류별/글로벌 전체" 보기와 페이지 번호 페이징을 추가한다.

**Architecture:** 신규 전역 엔드포인트 `GET /discussion-threads`(서비스 스코프 밖, 체크리스트 매트릭스 패턴)를 추가한다. 서비스 계층이 분류를 serviceId 목록으로 해석한 뒤 리포지토리가 `service_id IN (...)` + Oracle `OFFSET/FETCH` + `COUNT`로 페이징한다. mock 리포지토리도 동일 의미로 구현한다. 프론트는 `getThreadsPaged`와 CommentBoard의 `allMode`(페이지 바)로 소비한다.

**Tech Stack:** 백엔드 NestJS 11 + oracledb(Thin) + jest. 프론트 Vite/React 19 + vitest. mock/실DB는 `repositoryProvider`로 분기(`appConfig.isMock()`).

## Global Constraints

- 정렬은 **최신순 `t.id DESC`** (다중 프로그램에서 줄번호 혼합 방지, 페이징 안정).
- `RESOLVED`(해결됨) 스레드는 **항상 제외**(기존 per-service 동작과 일치).
- 페이지: `page` 1-base 기본 1, `size` 기본 20, **상한 100**. 범위 밖 값은 기본/상한으로 보정.
- 기존 `GET /services/:serviceId/discussion-threads` 는 **변경 금지**(시그니처 보존).
- mock·실DB 리포지토리는 **동일한 동작**을 보장한다(빌드 검증 메모리: 실DB 단위테스트 불가 → mock이 계약 보증).
- 분류→serviceId 해석은 **서비스 계층**에서. 빈 스코프(매칭 serviceId 0개)는 404가 아니라 `{ items: [], totalCount: 0 }`.
- `service_id IN (...)` Oracle 한도 1000개. 분류 스코프 내 프로그램 수가 그 이하라고 가정(초과 시 후속 과제로 JOIN 전환).
- 코딩 가이드: 들여쓰기 3단계 이하, Guard Clause, `as any`/`as unknown as` 금지, 안 쓰는 import 정리.
- 검증: FE는 `npx vite build`, BE는 `npm run build`(nest build). `tsc -b`/`jest` 전체 스위트는 pre-existing-red이므로 **신규 테스트 파일만 타깃 실행**으로 통과 확인.
- 작업 후 `docs/한일/2026-06-18.md`에 기록(외부 API 변경=신규 엔드포인트 명시).
- 커밋 메시지 스타일: 레포 관례 `feat : ...` / `fix : ...`(콜론 앞 공백). 커밋은 각 태스크 끝에서 수행.

**경로 표기:** BE 파일은 `comparsion-be/` 루트 기준, FE 파일은 `comparsionV2/`(현재 작업 폴더) 루트 기준. 명령은 해당 레포 루트에서 실행.

---

### Task 1: 리포지토리 `findPaged` (인터페이스 + mock + 실DB)

스레드 페이징 조회를 리포지토리 계약에 추가하고 mock/실DB 양쪽을 구현한다. 인터페이스를 한 태스크에서 양쪽 구현과 함께 추가해 TS 컴파일을 깨지 않는다.

**Files:**
- Modify: `comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.interface.ts`
- Modify: `comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.ts`
- Modify: `comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.ts`
- Test: `comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.spec.ts` (create)

**Interfaces:**
- Produces:
  - `DiscussionThreadPageFilter = { serviceIds?: string[]; opinionType?: string; page: number; size: number }`
  - `DiscussionThreadPage = { items: any[]; totalCount: number }`
  - `IDiscussionThreadRepository.findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage>`
  - 의미: `status <> 'RESOLVED'` 항상 적용. `serviceIds` 있으면 그 안에서만, 없으면(undefined) 전역. `serviceIds`가 빈 배열이면 결과 없음. `opinionType` 있으면 일치만. 정렬 `id DESC`. `offset=(page-1)*size`.

- [ ] **Step 1: mock 리포지토리 실패 테스트 작성**

Create `comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.spec.ts`:

```ts
import { MockDiscussionThreadRepository } from './mock-discussion-thread.repository';

// 시드(비-RESOLVED): id5(b,OMISSION), id4(a,EXPLANATION), id2(b,BUSINESS_CHECK), id1(a,MISMATCH)
// id3(a)는 RESOLVED → 항상 제외. 정렬은 id DESC.
describe('MockDiscussionThreadRepository.findPaged', () => {
  let repo: MockDiscussionThreadRepository;
  beforeEach(() => { repo = new MockDiscussionThreadRepository(); });

  it('전역 1페이지(size2)를 최신순으로 반환하고 totalCount는 비-RESOLVED 총합', async () => {
    const { items, totalCount } = await repo.findPaged({ page: 1, size: 2 });
    expect(items.map((t) => t.id)).toEqual([5, 4]);
    expect(totalCount).toBe(4);
  });

  it('2페이지(size2)', async () => {
    const { items } = await repo.findPaged({ page: 2, size: 2 });
    expect(items.map((t) => t.id)).toEqual([2, 1]);
  });

  it('RESOLVED(id3)는 제외된다', async () => {
    const { items } = await repo.findPaged({ page: 1, size: 100 });
    expect(items.some((t) => t.id === 3)).toBe(false);
  });

  it('serviceIds 로 필터한다', async () => {
    const { items, totalCount } = await repo.findPaged({ serviceIds: ['a'], page: 1, size: 100 });
    expect(items.map((t) => t.id)).toEqual([4, 1]);
    expect(totalCount).toBe(2);
  });

  it('opinionType 으로 필터한다', async () => {
    const { items, totalCount } = await repo.findPaged({ opinionType: 'OMISSION', page: 1, size: 100 });
    expect(items.map((t) => t.id)).toEqual([5]);
    expect(totalCount).toBe(1);
  });

  it('범위를 벗어난 페이지는 빈 배열이지만 totalCount는 유지', async () => {
    const { items, totalCount } = await repo.findPaged({ page: 9, size: 2 });
    expect(items).toEqual([]);
    expect(totalCount).toBe(4);
  });

  it('serviceIds 빈 배열이면 결과 없음', async () => {
    const { items, totalCount } = await repo.findPaged({ serviceIds: [], page: 1, size: 20 });
    expect(items).toEqual([]);
    expect(totalCount).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (in `comparsion-be`): `npx jest src/discussion-threads/port/out/mock-discussion-thread.repository.spec.ts`
Expected: FAIL — `repo.findPaged is not a function`.

- [ ] **Step 3: 인터페이스에 `findPaged` 추가**

Edit `comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.interface.ts` — 전체를 아래로 교체:

```ts
import { CreateDiscussionThreadRepositoryDto, UpdateDiscussionThreadRepositoryDto } from './discussion-thread.repository.dto';

export interface DiscussionThreadPageFilter {
  serviceIds?: string[]; // 없으면(undefined) 전역, 빈 배열이면 결과 없음
  opinionType?: string;  // 없으면 유형 전체
  page: number;          // 1-base
  size: number;
}

export interface DiscussionThreadPage {
  items: any[];
  totalCount: number;
}

export interface IDiscussionThreadRepository {
  create(serviceId: string, dto: CreateDiscussionThreadRepositoryDto): Promise<number>;
  findAll(): Promise<any[]>;
  findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage>;
  findOne(id: number): Promise<any>;
  update(id: number, dto: UpdateDiscussionThreadRepositoryDto): Promise<number>;
  updateReaction(id: number, reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null): Promise<number>;
  remove(id: number): Promise<number>;
}
```

- [ ] **Step 4: mock 구현 추가**

Edit `comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.ts`:
- 상단 import 에 타입 추가:

```ts
import { IDiscussionThreadRepository, DiscussionThreadPageFilter, DiscussionThreadPage } from './discussion-thread.repository.interface';
```

- 기존 `findAll()` 메서드 바로 아래에 추가:

```ts
  async findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage> {
    const { serviceIds, opinionType, page, size } = filter;

    let rows = this.threads.filter((t) => t.status !== 'RESOLVED');
    if (serviceIds) {
      const set = new Set(serviceIds);
      rows = rows.filter((t) => set.has(t.serviceId));
    }
    if (opinionType) {
      rows = rows.filter((t) => t.opinionType === opinionType);
    }

    rows.sort((a, b) => b.id - a.id);
    const totalCount = rows.length;
    const offset = (page - 1) * size;
    const items = rows.slice(offset, offset + size);
    return { items, totalCount };
  }
```

- [ ] **Step 5: mock 테스트 통과 확인**

Run (in `comparsion-be`): `npx jest src/discussion-threads/port/out/mock-discussion-thread.repository.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: 실DB 구현 추가 (빌드 검증 — DB 단위테스트 없음)**

Edit `comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.ts`:
- 상단 import 에 타입 추가:

```ts
import { IDiscussionThreadRepository, DiscussionThreadPageFilter, DiscussionThreadPage } from './discussion-thread.repository.interface';
```

- 기존 `findAll()` 메서드 바로 아래에 추가:

```ts
  async findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage> {
    const { serviceIds, opinionType, page, size } = filter;

    const where: string[] = [`t.status <> 'RESOLVED'`];
    const binds: Record<string, any> = {};

    if (serviceIds && serviceIds.length > 0) {
      const names = serviceIds.map((_, i) => `:sid${i}`);
      where.push(`t.service_id IN (${names.join(', ')})`);
      serviceIds.forEach((id, i) => { binds[`sid${i}`] = id; });
    }
    if (opinionType) {
      where.push(`t.opinion_type = :opinionType`);
      binds.opinionType = opinionType;
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // 총건수 — 조건이 모두 t 컬럼이라 JOIN 불필요
    const countSql = `
      SELECT COUNT(*) AS "cnt"
      FROM comparsion_discussion_thread t
      ${whereSql}
    `;
    const countRow = await this.selectOne(countSql, binds);
    const totalCount = Number(countRow?.cnt ?? 0);

    // 목록 — 기존 THREAD_VIEW(메타+첫 메시지) 재사용, id DESC, SQL 페이징
    const offset = (page - 1) * size;
    const listSql = `
      ${THREAD_VIEW}
      ${whereSql}
      ORDER BY t.id DESC
      OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY
    `;
    const items = await this.selectList(listSql, { ...binds, offset, size });

    return { items, totalCount };
  }
```

- [ ] **Step 7: 빌드 확인**

Run (in `comparsion-be`): `npm run build`
Expected: 성공(에러 0). (실DB 쿼리는 Oracle 부재로 단위테스트 불가 — mock이 동일 계약을 보증, 쿼리는 리뷰로 검증.)

- [ ] **Step 8: 커밋**

```bash
git add comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.interface.ts \
        comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.ts \
        comparsion-be/src/discussion-threads/port/out/discussion-thread.repository.spec.ts \
        comparsion-be/src/discussion-threads/port/out/mock-discussion-thread.repository.spec.ts
git commit -m "feat : discussion-thread findPaged 추가 (mock+실DB, 페이징/필터)"
```

---

### Task 2: 서비스 `findAllPaged` + ServicesModule 주입

분류→serviceId 해석 후 페이징 결과를 만든다.

**Files:**
- Modify: `comparsion-be/src/discussion-threads/discussion-threads.service.ts`
- Modify: `comparsion-be/src/discussion-threads/discussion-threads.module.ts`
- Test: `comparsion-be/src/discussion-threads/discussion-threads.service.spec.ts:1-24` (providers 보강) + 신규 describe

**Interfaces:**
- Consumes: `IDiscussionThreadRepository.findPaged`(Task 1), `ServicesService.findAll()` (반환 행 키: `serviceId`/`bigCategory`/`middleCategory`).
- Produces: `DiscussionThreadsService.findAllPaged(params: { bigCategory?: string; middleCategory?: string; opinionType?: string; page: number; size: number }): Promise<{ items: any[]; page: number; size: number; totalCount: number }>`

- [ ] **Step 1: 서비스 실패 테스트 작성**

Edit `comparsion-be/src/discussion-threads/discussion-threads.service.spec.ts`:
- import 와 providers 를 ServicesService/MockServiceRepository 포함하도록 보강. 파일 상단 import 블록 교체:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionThreadsService } from './discussion-threads.service';
import { MockDiscussionThreadRepository } from './port/out/mock-discussion-thread.repository';
import { ServicesService } from '../services/services.service';
import { MockServiceRepository } from '../services/port/out/mock-service.repository';
```

- `Test.createTestingModule` 의 providers 배열을 교체:

```ts
      providers: [
        DiscussionThreadsService,
        { provide: 'DISCUSSION_THREAD_REPOSITORY', useClass: MockDiscussionThreadRepository },
        ServicesService,
        { provide: 'SERVICE_REPOSITORY', useClass: MockServiceRepository },
      ],
```

- 파일 맨 아래 마지막 `});`(describe 닫힘) **앞에** 신규 describe 추가:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run (in `comparsion-be`): `npx jest src/discussion-threads/discussion-threads.service.spec.ts`
Expected: FAIL — `service.findAllPaged is not a function` (그리고 DI에서 ServicesService 추가는 통과).

- [ ] **Step 3: 서비스에 주입 + 메서드 구현**

Edit `comparsion-be/src/discussion-threads/discussion-threads.service.ts`:
- 상단 import 추가:

```ts
import { ServicesService } from '../services/services.service';
```

- 생성자를 교체(ServicesService 주입):

```ts
  constructor(
    @Inject('DISCUSSION_THREAD_REPOSITORY')
    private readonly repository: IDiscussionThreadRepository,
    private readonly servicesService: ServicesService,
  ) {}
```

- 기존 `findAll(serviceId?)` 메서드 바로 아래에 추가:

```ts
  // 분류별/글로벌 전체 + 페이징. 분류는 serviceId 목록으로 해석해 IN 조건으로 넘긴다.
  async findAllPaged(params: {
    bigCategory?: string;
    middleCategory?: string;
    opinionType?: string;
    page: number;
    size: number;
  }) {
    const { bigCategory, middleCategory, opinionType, page, size } = params;

    let serviceIds: string[] | undefined;
    if (bigCategory || middleCategory) {
      const services = await this.servicesService.findAll();
      const ids = new Set<string>();
      for (const s of services) {
        const big = s.bigCategory ?? s.BIG_CATEGORY ?? s.big_category;
        const mid = s.middleCategory ?? s.MIDDLE_CATEGORY ?? s.middle_category;
        const sid = s.serviceId ?? s.SERVICE_ID ?? s.service_id;
        if (bigCategory && big !== bigCategory) continue;
        if (middleCategory && mid !== middleCategory) continue;
        if (sid) ids.add(sid);
      }
      serviceIds = Array.from(ids);
      if (serviceIds.length === 0) {
        return { items: [], page, size, totalCount: 0 };
      }
    }

    const { items, totalCount } = await this.repository.findPaged({ serviceIds, opinionType, page, size });
    return { items, page, size, totalCount };
  }
```

- [ ] **Step 4: ServicesModule import**

Edit `comparsion-be/src/discussion-threads/discussion-threads.module.ts`:
- import 추가: `import { ServicesModule } from '../services/services.module';`
- `@Module({ ... })` 에 `imports: [ServicesModule],` 추가(controllers/providers 위에):

```ts
@Module({
  imports: [ServicesModule],
  controllers: [DiscussionThreadsController],
  providers: [
    DiscussionThreadsService,
    repositoryProvider(
      'DISCUSSION_THREAD_REPOSITORY',
      DiscussionThreadRepository,
      MockDiscussionThreadRepository,
    ),
  ],
  exports: [DiscussionThreadsService],
})
```

- [ ] **Step 5: 테스트 통과 확인**

Run (in `comparsion-be`): `npx jest src/discussion-threads/discussion-threads.service.spec.ts`
Expected: PASS (기존 create/updateReaction + 신규 findAllPaged 7개).

- [ ] **Step 6: 빌드 확인**

Run (in `comparsion-be`): `npm run build`
Expected: 성공.

- [ ] **Step 7: 커밋**

```bash
git add comparsion-be/src/discussion-threads/discussion-threads.service.ts \
        comparsion-be/src/discussion-threads/discussion-threads.module.ts \
        comparsion-be/src/discussion-threads/discussion-threads.service.spec.ts
git commit -m "feat : findAllPaged 추가 (분류→serviceId 해석 + 페이징)"
```

---

### Task 3: 전역 컨트롤러 `GET /discussion-threads`

서비스 스코프 밖 전역 엔드포인트를 추가하고 모듈에 등록한다.

**Files:**
- Create: `comparsion-be/src/discussion-threads/port/in/global-discussion-threads.controller.ts`
- Modify: `comparsion-be/src/discussion-threads/discussion-threads.module.ts`

**Interfaces:**
- Consumes: `DiscussionThreadsService.findAllPaged`(Task 2).
- Produces: HTTP `GET /discussion-threads?bigCategory=&middleCategory=&opinionType=&page=&size=` → `{ items, page, size, totalCount }`. `page` 기본 1, `size` 기본 20·상한 100.

- [ ] **Step 1: 컨트롤러 작성**

Create `comparsion-be/src/discussion-threads/port/in/global-discussion-threads.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { DiscussionThreadsService } from '../../discussion-threads.service';

// 모아보기 대시보드용 — 분류별/글로벌 전체 의견(페이징). service 스코프 밖이라 별도 컨트롤러.
@Controller('discussion-threads')
export class GlobalDiscussionThreadsController {
  constructor(private readonly discussionThreadsService: DiscussionThreadsService) {}

  @Get()
  findAllPaged(
    @Query('bigCategory') bigCategory?: string,
    @Query('middleCategory') middleCategory?: string,
    @Query('opinionType') opinionType?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = this.toPage(page);
    const sizeNum = this.toSize(size);
    return this.discussionThreadsService.findAllPaged({
      bigCategory: bigCategory || undefined,
      middleCategory: middleCategory || undefined,
      opinionType: opinionType || undefined,
      page: pageNum,
      size: sizeNum,
    });
  }

  // page: 1-base, 1 미만/비정상 → 1
  private toPage(raw?: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return 1;
    return n;
  }

  // size: 1~100, 비정상 → 20, 100 초과 → 100
  private toSize(raw?: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return 20;
    if (n > 100) return 100;
    return n;
  }
}
```

- [ ] **Step 2: 모듈에 컨트롤러 등록**

Edit `comparsion-be/src/discussion-threads/discussion-threads.module.ts`:
- import 추가: `import { GlobalDiscussionThreadsController } from './port/in/global-discussion-threads.controller';`
- `controllers` 배열에 추가:

```ts
  controllers: [DiscussionThreadsController, GlobalDiscussionThreadsController],
```

- [ ] **Step 3: 빌드 확인**

Run (in `comparsion-be`): `npm run build`
Expected: 성공.

- [ ] **Step 4: mock 모드 수동 스모크 (선택)**

Run (in `comparsion-be`): `npm run start:mock` 후 별도 셸에서
`curl "http://localhost:50004/discussion-threads?page=1&size=2"`
Expected: `{"items":[{"id":5,...},{"id":4,...}],"page":1,"size":2,"totalCount":4}` 형태. 확인 후 서버 종료.

- [ ] **Step 5: 커밋**

```bash
git add comparsion-be/src/discussion-threads/port/in/global-discussion-threads.controller.ts \
        comparsion-be/src/discussion-threads/discussion-threads.module.ts
git commit -m "feat : GET /discussion-threads 전역 페이징 엔드포인트 추가"
```

---

### Task 4: 프론트 페이징 헬퍼 (pure)

페이지 계산 로직을 순수 함수로 분리해 테스트한다.

**Files:**
- Create: `comparsionV2/src/pagination.ts`
- Test: `comparsionV2/test/pagination.test.ts` (create)

**Interfaces:**
- Produces:
  - `getTotalPages(totalCount: number, size: number): number` (최소 1)
  - `getPageNumbers(current: number, totalPages: number, maxButtons?: number): number[]`

- [ ] **Step 1: 실패 테스트 작성**

Create `comparsionV2/test/pagination.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTotalPages, getPageNumbers } from '../src/pagination';

describe('getTotalPages', () => {
  it('0건이면 최소 1페이지', () => { expect(getTotalPages(0, 20)).toBe(1); });
  it('정확히 나누어떨어짐', () => { expect(getTotalPages(40, 20)).toBe(2); });
  it('나머지가 있으면 올림', () => { expect(getTotalPages(41, 20)).toBe(3); });
});

describe('getPageNumbers', () => {
  it('전체가 버튼 수보다 적으면 그대로', () => {
    expect(getPageNumbers(1, 3, 5)).toEqual([1, 2, 3]);
  });
  it('중앙 정렬 슬라이딩', () => {
    expect(getPageNumbers(5, 10, 5)).toEqual([3, 4, 5, 6, 7]);
  });
  it('시작 경계', () => {
    expect(getPageNumbers(1, 10, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('끝 경계', () => {
    expect(getPageNumbers(10, 10, 5)).toEqual([6, 7, 8, 9, 10]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (in `comparsionV2`): `npx vitest run test/pagination.test.ts`
Expected: FAIL — 모듈 `../src/pagination` 없음.

- [ ] **Step 3: 구현 작성**

Create `comparsionV2/src/pagination.ts`:

```ts
/** 총 페이지 수 (최소 1). */
export const getTotalPages = (totalCount: number, size: number): number =>
  Math.max(1, Math.ceil(totalCount / size));

/**
 * 페이지 바에 표시할 페이지 번호 목록.
 * 현재 페이지를 중심으로 최대 maxButtons 개를 슬라이딩 윈도우로 반환한다.
 */
export const getPageNumbers = (current: number, totalPages: number, maxButtons = 5): number[] => {
  const count = Math.min(maxButtons, totalPages);
  let start = current - Math.floor(count / 2);
  if (start < 1) start = 1;
  if (start + count - 1 > totalPages) start = totalPages - count + 1;
  return Array.from({ length: count }, (_, i) => start + i);
};
```

- [ ] **Step 4: 통과 확인**

Run (in `comparsionV2`): `npx vitest run test/pagination.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/pagination.ts test/pagination.test.ts
git commit -m "feat : 페이징 계산 헬퍼(pagination.ts) 추가"
```

---

### Task 5: 프론트 `getThreadsPaged` + thread 매핑 DRY

discussionService 에 페이징 조회를 추가한다. 기존 `getThreads` 의 매핑 로직을 공용 함수로 추출해 재사용한다(공개 시그니처 불변).

**Files:**
- Modify: `comparsionV2/src/discussionService.ts`
- Test: `comparsionV2/test/discussionPaged.test.ts` (create)

**Interfaces:**
- Consumes: 백엔드 `GET /discussion-threads`(Task 3) 응답 `{ items, page, size, totalCount }`.
- Produces: `discussionService.getThreadsPaged(params: { bigCategory?: string; middleCategory?: string; opinionType?: OpinionType; page: number; size: number }): Promise<{ items: DiscussionThread[]; page: number; size: number; totalCount: number }>`

- [ ] **Step 1: 실패 테스트 작성**

Create `comparsionV2/test/discussionPaged.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discussionService } from '../src/discussionService';

describe('discussionService.getThreadsPaged', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          { id: 5, serviceId: 'b', location: 30, codeKind: 'pb', status: 'CHECK_PB5', opinionType: 'OMISSION', content: 'x', writerRole: 'pb', writerName: '이', createdAt: '2026-01-01' },
        ],
        page: 1, size: 20, totalCount: 1,
      }),
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('쿼리스트링을 조립하고 응답을 매핑한다', async () => {
    const res = await discussionService.getThreadsPaged({ bigCategory: '계좌', opinionType: 'OMISSION', page: 1, size: 20 });

    const calledUrl = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/discussion-threads?');
    expect(calledUrl).toContain('bigCategory=%EA%B3%84%EC%A2%8C'); // '계좌' URL 인코딩
    expect(calledUrl).toContain('opinionType=OMISSION');
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('size=20');

    expect(res.totalCount).toBe(1);
    expect(res.items[0]).toMatchObject({ id: 5, service_id: 'b', line_number: 30, code_kind: 'pb', opinion_type: 'OMISSION' });
  });

  it('빈 값 파라미터는 쿼리에서 생략한다', async () => {
    await discussionService.getThreadsPaged({ page: 2, size: 20 });
    const calledUrl = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('bigCategory');
    expect(calledUrl).not.toContain('opinionType');
    expect(calledUrl).toContain('page=2');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (in `comparsionV2`): `npx vitest run test/discussionPaged.test.ts`
Expected: FAIL — `getThreadsPaged is not a function`.

- [ ] **Step 3: 매핑 추출 + 메서드 추가**

Edit `comparsionV2/src/discussionService.ts`:
- `discussionService` 객체 선언 **위**(BASE_URL 아래)에 공용 매핑 함수 추가:

```ts
// 백엔드 thread 행(camelCase) → UI DiscussionThread(snake_case) 매핑. getThreads/getThreadsPaged 공용.
const mapThread = (item: any): DiscussionThread => ({
  id: item.id,
  service_id: item.serviceId,
  line_number: item.location || 0, // location 필드를 줄 번호로 사용
  code_kind: (item.codeKind as CodeKind) || 'pb5', // 구버전 데이터 호환: 없으면 pb5
  status: item.status,
  reaction: (item.reaction as ThreadReaction) ?? null,
  opinion_type: (item.opinionType as OpinionType) ?? null,
  content: item.content,
  writer_role: item.writerRole,
  writer_name: item.writerName,
  created_at: item.createdAt,
  resolved_at: item.resolvedAt,
});
```

- `getThreads` 내부의 `return data.map((item: any) => ({ ... }));` 블록을 아래로 교체(동작 동일, DRY):

```ts
    return data.map(mapThread);
```

- `getThreads` 메서드 바로 뒤에 신규 메서드 추가:

```ts
  /**
   * 분류별/글로벌 전체 의견을 페이징해서 가져옵니다.
   * bigCategory/middleCategory 미지정 = 글로벌. opinionType 미지정 = 유형 전체.
   */
  async getThreadsPaged(params: {
    bigCategory?: string;
    middleCategory?: string;
    opinionType?: OpinionType;
    page: number;
    size: number;
  }): Promise<{ items: DiscussionThread[]; page: number; size: number; totalCount: number }> {
    const qs = new URLSearchParams();
    if (params.bigCategory) qs.set('bigCategory', params.bigCategory);
    if (params.middleCategory) qs.set('middleCategory', params.middleCategory);
    if (params.opinionType) qs.set('opinionType', params.opinionType);
    qs.set('page', String(params.page));
    qs.set('size', String(params.size));

    const response = await fetch(`${BASE_URL}/discussion-threads?${qs.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch threads: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      items: (data.items ?? []).map(mapThread),
      page: data.page,
      size: data.size,
      totalCount: data.totalCount,
    };
  },
```

- [ ] **Step 4: 통과 확인**

Run (in `comparsionV2`): `npx vitest run test/discussionPaged.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 기존 thread 테스트 회귀 확인**

Run (in `comparsionV2`): `npx vitest run test/commentThread.test.ts test/commentSort.test.ts`
Expected: PASS (매핑 추출이 기존 동작을 깨지 않음).

- [ ] **Step 6: 커밋**

```bash
git add src/discussionService.ts test/discussionPaged.test.ts
git commit -m "feat : getThreadsPaged 추가 + thread 매핑 공용화"
```

---

### Task 6: CommentBoard 에 전체 모아보기 + 페이지 바

**Files:**
- Modify: `comparsionV2/src/CommentBoard.tsx`

**Interfaces:**
- Consumes: `discussionService.getThreadsPaged`(Task 5), `getTotalPages`/`getPageNumbers`(Task 4).
- Produces: UI 동작만(외부 시그니처 없음). `allMode` 상태에서 서버 정렬/필터/페이징 사용.

- [ ] **Step 1: import 추가**

Edit `comparsionV2/src/CommentBoard.tsx` 상단 import 영역에 추가:

```ts
import { getTotalPages, getPageNumbers } from './pagination';
```

- [ ] **Step 2: 상태 + 로더 추가**

`const [opinionFilter, ...]` 선언 줄 바로 아래에 추가:

```ts
  const [allMode, setAllMode] = useState(false); // 분류별/글로벌 전체(페이징)
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
```

- 컴포넌트 함수 본문 상단(파일 내 `formatDateTime` 등 모듈 상수와 별개로) 컴포넌트 밖 모듈 상수로 추가(파일 상단 `const STATUS_LABEL` 부근):

```ts
const PAGE_SIZE = 20;
```

- `loadFavThreads` 정의 바로 아래에 전체 로더 추가:

```ts
  // 분류별/글로벌 전체 — 서버 페이징. 종료 등으로 현재 페이지가 비고 page>1이면 한 페이지 앞으로.
  const loadAllThreads = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const res = await discussionService.getThreadsPaged({
        bigCategory: selectedBig || undefined,
        middleCategory: selectedMiddle || undefined,
        opinionType: opinionFilter === 'ALL' ? undefined : opinionFilter,
        page: targetPage,
        size: PAGE_SIZE,
      });
      if (res.items.length === 0 && targetPage > 1) {
        return loadAllThreads(targetPage - 1);
      }
      setThreads(res.items);
      setTotalCount(res.totalCount);
      setPage(res.page);
    } catch (e) {
      setError(getErrorMessage(e));
      setThreads([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBig, selectedMiddle, opinionFilter]);
```

- [ ] **Step 3: allMode 진입/스코프·유형 변경 시 재조회 effect 추가**

`reload` 정의(또는 기존 useEffect들) 부근에 추가:

```ts
  // allMode 진입 및 스코프/유형 변경 시 1페이지부터 재조회
  useEffect(() => {
    if (!allMode) return;
    loadAllThreads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMode, selectedBig, selectedMiddle, opinionFilter]);
```

- [ ] **Step 4: 정렬/필터가 allMode를 우회하도록 수정**

기존 `sorted`/`visible` useMemo 두 개를 교체:

```ts
  // allMode 는 서버가 정렬·필터를 끝내므로 클라 정렬/필터를 우회한다.
  const sorted = useMemo(() => (allMode ? threads : sortThreadsForBoard(threads)), [threads, allMode]);
  const visible = useMemo(
    () => (allMode || opinionFilter === 'ALL' ? sorted : sorted.filter((t) => t.opinion_type === opinionFilter)),
    [sorted, opinionFilter, allMode],
  );
```

- [ ] **Step 5: reload + 모드 전환 핸들러 수정**

기존 `reload` 를 교체:

```ts
  const reload = useCallback(() => {
    if (allMode) loadAllThreads(page);
    else if (favMode) loadFavThreads();
    else if (selectedProgram) loadThreads(selectedProgram);
  }, [allMode, page, loadAllThreads, favMode, selectedProgram, loadFavThreads, loadThreads]);
```

- `handleSelectProgram` 교체(프로그램 직접 선택 시 allMode 해제):

```ts
  const handleSelectProgram = (serviceId: string) => { setAllMode(false); setFavMode(false); setSelectedProgram(serviceId); loadThreads(serviceId); };
```

- `toggleFavMode` 내부, `setFavMode(true);` 줄 위에 `setAllMode(false);` 추가.

- `toggleFavMode` 정의 바로 아래에 전체 토글 추가:

```ts
  // 전체 모아보기 토글 — 현재 선택된 분류를 스코프로(없으면 글로벌). 프로그램 선택은 무시.
  const toggleAllMode = () => {
    if (allMode) { setAllMode(false); setThreads([]); setTotalCount(0); setExpandedId(null); return; }
    setFavMode(false);
    setSelectedProgram('');
    setPage(1);
    setAllMode(true); // effect 가 1페이지 로드
  };
```

- [ ] **Step 6: 전체 모아보기 버튼 추가**

`★ 즐겨찾기 모아보기` 버튼(JSX) 바로 아래에 추가:

```tsx
        <button
          type="button"
          onClick={toggleAllMode}
          aria-pressed={allMode}
          className={`shrink-0 px-4 py-2 rounded font-bold text-sm shadow-sm transition-all whitespace-nowrap ${allMode ? 'bg-sky-300 text-sky-900 ring-2 ring-sky-200' : 'bg-indigo-500 text-white hover:bg-indigo-400'}`}
        >전체 모아보기{selectedMiddle ? ` (${selectedMiddle})` : selectedBig ? ` (${selectedBig})` : ' (전 분류)'}</button>
```

- [ ] **Step 7: 유형 필터 노출 조건 + 클릭 동작 + 빈/플레이스홀더 조건에 allMode 반영**

- 유형 필터 블록 노출 조건 `{sorted.length > 0 && (` 을 `{(allMode || sorted.length > 0) && (` 으로 교체(allMode면 서버 필터라 항상 노출).

- 목록 영역 상단 안내/빈 조건들을 교체. 기존 5개 조건 블록을 아래로 교체:

```tsx
        {!selectedProgram && !favMode && !allMode && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">프로그램명을 선택하거나 ★ 즐겨찾기 / 전체 모아보기를 눌러 의견을 모아 보세요.</div>
        )}
        {favMode && favorites.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">즐겨찾기한 프로그램이 없습니다. 선택바의 ☆로 추가하세요.</div>
        )}
        {(selectedProgram || allMode || (favMode && favorites.length > 0)) && isLoading && (
          <div className="text-slate-400 text-sm p-8 text-center animate-pulse">의견을 불러오는 중...</div>
        )}
        {(selectedProgram || allMode || (favMode && favorites.length > 0)) && !isLoading && error && (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100 font-bold">⚠️ {error}</div>
        )}
        {allMode && !isLoading && !error && totalCount === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">등록된 의견이 없습니다.</div>
        )}
        {!allMode && (selectedProgram || (favMode && favorites.length > 0)) && !isLoading && !error && sorted.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">등록된 의견이 없습니다.</div>
        )}
        {!allMode && !isLoading && !error && sorted.length > 0 && visible.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">해당 유형의 의견이 없습니다.</div>
        )}
```

- [ ] **Step 8: 페이지 바 추가**

목록 컨테이너 `</div>`(class 에 `flex-1 min-h-0 overflow-auto` 가 있는 div의 닫는 태그) **바로 아래**, `{toast && (` **위**에 추가:

```tsx
      {allMode && !isLoading && !error && totalCount > 0 && (
        <div className="flex items-center justify-center gap-1.5 flex-shrink-0 py-1 flex-wrap">
          <span className="text-[11px] font-black text-slate-500 mr-2">총 {totalCount}건 · {page}/{getTotalPages(totalCount, PAGE_SIZE)}페이지</span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => loadAllThreads(page - 1)}
            className="px-2.5 py-1 rounded-lg text-[12px] font-black border bg-white text-slate-500 border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >이전</button>
          {getPageNumbers(page, getTotalPages(totalCount, PAGE_SIZE)).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === page}
              onClick={() => loadAllThreads(n)}
              className={`px-3 py-1 rounded-lg text-[12px] font-black border transition-all ${n === page ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >{n}</button>
          ))}
          <button
            type="button"
            disabled={page >= getTotalPages(totalCount, PAGE_SIZE)}
            onClick={() => loadAllThreads(page + 1)}
            className="px-2.5 py-1 rounded-lg text-[12px] font-black border bg-white text-slate-500 border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >다음</button>
        </div>
      )}
```

- [ ] **Step 9: 빌드 확인**

Run (in `comparsionV2`): `npx vite build`
Expected: 성공(에러 0).

- [ ] **Step 10: 프리뷰 수동 검증**

preview_start 로 dev 서버 기동(백엔드는 `npm run start:mock` 가동 가정) → 의견 모아보기 탭 →
- "전체 모아보기" 클릭 → 글로벌 전체 카드 목록 + 하단 "총 N건 · 1/Y페이지" + 페이지 버튼 노출 확인
- 대분류만 선택 → 라벨이 `(대분류명)`으로 바뀌고 그 범위로 재조회
- 유형 칩 클릭 → 1페이지로 재조회, 목록 갱신
- 페이지 버튼 클릭 → 다음 페이지 로드, 목록 맨 위부터
- 카드 펼쳐 답글/종료 → 현재 페이지 갱신
preview_screenshot 으로 결과 캡처.

- [ ] **Step 11: 커밋**

```bash
git add src/CommentBoard.tsx
git commit -m "feat : 의견 모아보기 전체 모아보기 + 페이지 번호 페이징"
```

---

### Task 7: 한일 기록 + 최종 검증

**Files:**
- Create/Modify: `comparsionV2/docs/한일/2026-06-18.md`

- [ ] **Step 1: 최종 빌드 검증(양쪽)**

Run (in `comparsion-be`): `npm run build` → 성공
Run (in `comparsion-be`): `npx jest src/discussion-threads` → 신규/기존 discussion 테스트 PASS
Run (in `comparsionV2`): `npx vite build` → 성공
Run (in `comparsionV2`): `npx vitest run test/pagination.test.ts test/discussionPaged.test.ts` → PASS

- [ ] **Step 2: 한일 기록 작성**

`comparsionV2/docs/한일/2026-06-18.md` 가 없으면 생성, 있으면 맨 아래 append:

```markdown
# 2026-06-18

## 의견 모아보기 — 분류별/글로벌 전체 + 페이징
- 여러 프로그램 의견을 한 화면에 모아 보는 "전체 모아보기" 추가(분류 스코프, 없으면 글로벌). 프로그램명 선택은 제외.
- 페이지 번호 방식 페이징(총건수·이전/다음/번호, 페이지당 20건).
- **외부 API 변경**: 신규 `GET /discussion-threads?bigCategory=&middleCategory=&opinionType=&page=&size=` → `{ items, page, size, totalCount }`. 기존 `GET /services/:serviceId/discussion-threads` 불변.
- 백엔드: 분류→serviceId 해석 후 `service_id IN (...)` + Oracle OFFSET/FETCH + COUNT. mock 동일 구현. 정렬 id DESC, RESOLVED 제외, size 상한 100.
- 결과: BE `nest build` OK, 신규 jest 통과 / FE `vite build` OK, 신규 vitest 통과.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/한일/2026-06-18.md
git commit -m "docs : 한일 2026-06-18 의견 전체 모아보기+페이징 기록"
```

---

## Self-Review

**1. Spec coverage**
- 전체 보기(분류 스코프/글로벌, 프로그램명 제외) → Task 2(서비스 해석)+Task 6(버튼/effect). ✓
- 페이지 번호 페이징(총건수/이전·다음·번호) → Task 4(헬퍼)+Task 6(페이지 바). ✓
- 신규 API 계약 `{items,page,size,totalCount}`, size 상한 100 → Task 3(컨트롤러 toSize). ✓
- 기존 per-service 엔드포인트 보존 → 변경 대상에 없음. ✓
- SQL 페이징/필터/RESOLVED 제외/id DESC → Task 1(real findPaged). ✓
- 분류→serviceId 해석, 빈 스코프 빈 결과 → Task 2 + 테스트. ✓
- mock 동등성 → Task 1 mock + 테스트. ✓
- IN-list 1000 한도 명시 → Global Constraints. ✓
- 유형 필터 서버사이드(allMode) → Task 6 loadAllThreads + effect. ✓
- 한일 기록(외부 API 변경 명시) → Task 7. ✓

**2. Placeholder scan**: TBD/TODO/"적절히"/"비슷하게" 없음. 모든 코드 스텝에 실제 코드 포함. ✓

**3. Type consistency**:
- `findPaged(filter)` 시그니처/반환(`{items,totalCount}`)이 인터페이스·mock·real·service 호출에서 일치. ✓
- `findAllPaged` 반환(`{items,page,size,totalCount}`)이 컨트롤러·FE 소비와 일치. ✓
- FE 매핑 `mapThread` 가 `getThreads`/`getThreadsPaged` 공용, 반환은 `DiscussionThread`. ✓
- 페이징 헬퍼명 `getTotalPages`/`getPageNumbers` 가 Task 4 정의와 Task 6 사용에서 일치. (clampPage 는 미사용이라 제거 — 서버가 page를 echo.) ✓
