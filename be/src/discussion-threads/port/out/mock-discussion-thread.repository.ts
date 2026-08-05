import { Injectable } from '@nestjs/common';
import { IDiscussionThreadRepository, DiscussionThreadPageFilter, DiscussionThreadPage } from './discussion-thread.repository.interface';
import { CreateDiscussionThreadRepositoryDto, UpdateDiscussionThreadRepositoryDto } from './discussion-thread.repository.dto';

@Injectable()
export class MockDiscussionThreadRepository implements IDiscussionThreadRepository {
  // MOCK 은 A 포맷 저장을 그대로 흉내내지 않고, 조회 시 필요한 'B 뷰' 형태(본문 포함)를 바로 들고 있는다.
  private threads: any[] = [
    { id: 1, status: 'CHECK_PB5', lastReaction: 'REVIEWING', opinionType: 'MISMATCH', codeKind: 'pb5', writerRole: 'pb5', writerName: '김피비오', content: '첫 토론 주제입니다.', serviceId: 'a', location: 10, resolvedAt: null, createdAt: new Date('2023-10-27T09:00:00') },
    { id: 2, status: 'CHECK_PB', lastReaction: 'DONE', opinionType: 'BUSINESS_CHECK', codeKind: 'pb', writerRole: 'pb', writerName: '이피비', content: '데이터 정합성 확인 요청', serviceId: 'b', location: 25, resolvedAt: null, createdAt: new Date('2023-10-27T09:15:00') },
    { id: 3, status: 'RESOLVED', lastReaction: null, opinionType: 'ETC', codeKind: 'pb5', writerRole: 'pb5', writerName: '김피비오', content: '이미 해결된 쓰레드', serviceId: 'a', location: 5, resolvedAt: new Date('2023-10-27T10:00:00'), createdAt: new Date('2023-10-27T09:30:00') },
    { id: 4, status: 'CHECK_PB5', lastReaction: null, opinionType: 'EXPLANATION', codeKind: 'pb5', writerRole: 'pb5', writerName: '박오세대', content: 'PB5 검토 필요', serviceId: 'a', location: 15, resolvedAt: null, createdAt: new Date('2023-10-27T10:10:00') },
    { id: 5, status: 'CHECK_PB5', lastReaction: null, opinionType: 'OMISSION', codeKind: 'pb', writerRole: 'pb', writerName: '이피비', content: '연계 시스템 오류 보고', serviceId: 'b', location: 30, resolvedAt: null, createdAt: new Date('2023-10-27T10:45:00') },
  ];

  private nextId = 6;

  async create(serviceId: string, dto: CreateDiscussionThreadRepositoryDto): Promise<any> {
    const newThread = {
      id: this.nextId++,
      status: dto.status || 'CHECK_PB5',
      lastReaction: null,
      opinionType: dto.opinionType,
      codeKind: dto.codeKind,
      writerRole: dto.writerRole,
      writerName: dto.writerName,
      content: dto.content,
      serviceId: serviceId,
      location: dto.location,
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.threads.push(newThread);
    return newThread.id;
  }

  async findAll(serviceId?: string): Promise<any[]> {
    const rows = serviceId ? this.threads.filter((t) => t.serviceId === serviceId) : this.threads;
    return [...rows].sort((a, b) => b.id - a.id);
  }

  async findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage> {
    const { serviceIds, opinionType, status, mySide, page, size } = filter;

    // status: 'OPEN'(기본)=미해결만, 'RESOLVED'=완료만, 'ALL'=전체. (항상 새 배열 → 이후 sort 안전)
    let rows =
      status === 'RESOLVED'
        ? this.threads.filter((t) => t.status === 'RESOLVED')
        : status === 'ALL'
          ? [...this.threads]
          : this.threads.filter((t) => t.status !== 'RESOLVED');
    if (serviceIds) {
      const set = new Set(serviceIds);
      rows = rows.filter((t) => set.has(t.serviceId));
    }
    if (opinionType) {
      rows = rows.filter((t) => t.opinionType === opinionType);
    }

    // 정렬: 내 담당 '확인 필요' → 상대 '확인 필요' → 그 외, 같은 그룹은 id DESC. (repo ORDER BY 와 동일 계약)
    const myCheck = mySide ? `CHECK_${mySide.toUpperCase()}` : null;
    const rank = (s: string) => (myCheck && s === myCheck ? 0 : s === 'CHECK_PB' || s === 'CHECK_PB5' ? 1 : 2);
    rows.sort((a, b) => rank(a.status) - rank(b.status) || b.id - a.id);
    const totalCount = rows.length;
    const offset = (page - 1) * size;
    const items = rows.slice(offset, offset + size);
    return { items, totalCount };
  }

  async findOne(id: number): Promise<any> {
    return this.threads.find((t) => t.id === id);
  }

  async update(id: number, dto: UpdateDiscussionThreadRepositoryDto): Promise<number> {
    const index = this.threads.findIndex((t) => t.id === id);
    if (index === -1) return 0;

    if (dto.status) {
      this.threads[index].status = dto.status;
      if (this.threads[index].status === 'RESOLVED') {
        this.threads[index].resolvedAt = new Date();
      }
    }
    return 1;
  }

  async remove(id: number): Promise<number> {
    const initialLength = this.threads.length;
    this.threads = this.threads.filter((t) => t.id !== id);
    return initialLength - this.threads.length;
  }
}
