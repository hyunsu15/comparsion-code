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

  it("status 'RESOLVED' 면 완료(id3)만", async () => {
    const { items, totalCount } = await repo.findPaged({ status: 'RESOLVED', page: 1, size: 100 });
    expect(items.map((t) => t.id)).toEqual([3]);
    expect(totalCount).toBe(1);
  });

  it("status 'ALL' 이면 RESOLVED 포함 전체(id DESC)", async () => {
    const { items, totalCount } = await repo.findPaged({ status: 'ALL', page: 1, size: 100 });
    expect(items.map((t) => t.id)).toEqual([5, 4, 3, 2, 1]);
    expect(totalCount).toBe(5);
  });
});
