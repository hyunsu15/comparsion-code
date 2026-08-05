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
    expect(calledUrl).toContain('bigCategory=' + encodeURIComponent('계좌'));
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
