import { CreateDiscussionThreadRepositoryDto, UpdateDiscussionThreadRepositoryDto } from './discussion-thread.repository.dto';

export interface DiscussionThreadPageFilter {
  serviceIds?: string[]; // 없으면(undefined) 전역, 빈 배열이면 결과 없음
  opinionType?: string;  // 없으면 유형 전체
  status?: 'OPEN' | 'RESOLVED' | 'ALL'; // 없으면 OPEN(미해결, RESOLVED 제외)
  mySide?: string;       // 작성자 소속(pb/pb5) — 내 담당 '확인 필요'(CHECK_*)를 우선 정렬
  page: number;          // 1-base
  size: number;
}

export interface DiscussionThreadPage {
  items: any[];
  totalCount: number;
}

export interface IDiscussionThreadRepository {
  create(serviceId: string, dto: CreateDiscussionThreadRepositoryDto): Promise<number>;
  // serviceId 가 주어지면 SQL WHERE 로 걸러 해당 서비스 스레드만 조회한다(전체 스캔 방지).
  findAll(serviceId?: string): Promise<any[]>;
  findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage>;
  findOne(id: number): Promise<any>;
  update(id: number, dto: UpdateDiscussionThreadRepositoryDto): Promise<number>;
  remove(id: number): Promise<number>;
}
