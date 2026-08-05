import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IDiscussionThreadRepository } from './port/out/discussion-thread.repository.interface';
import { Transactional } from '../db/Transaction.decorator';
import { getNextStatus } from 'src/nextChecker';
import { ServicesService } from '../services/services.service';

@Injectable()
export class DiscussionThreadsService {
  constructor(
    @Inject('DISCUSSION_THREAD_REPOSITORY')
    private readonly repository: IDiscussionThreadRepository,
    private readonly servicesService: ServicesService,
  ) {}

  @Transactional()
  async create(
    content: string,
    serviceId: string,
    writerRole: string,
    writerName: string,
    codeKind: 'pb' | 'pb5',
    location: number,
    opinionType: 'MISMATCH' | 'OMISSION' | 'EXPLANATION' | 'BUSINESS_CHECK' | 'ETC',
  ) {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Content cannot be empty');
    }
    if (!writerName || writerName.trim() === '') {
      throw new BadRequestException('Writer name cannot be empty');
    }
    if (codeKind !== 'pb' && codeKind !== 'pb5') {
      throw new BadRequestException('codeKind must be pb or pb5');
    }
    const VALID_OPINION = ['MISMATCH', 'OMISSION', 'EXPLANATION', 'BUSINESS_CHECK', 'ETC'];
    if (!opinionType || !VALID_OPINION.includes(opinionType)) {
      throw new BadRequestException('opinionType must be one of MISMATCH, OMISSION, EXPLANATION, BUSINESS_CHECK, ETC');
    }
    // [status 갱신 책임 ①] 스레드 생성 시점 — 첫 글쓴이(writerRole)로 초기 상태를 계산한다.
    // (이후 메시지가 추가될 때 DiscussionMessageService.create 에서만 다시 갱신된다.)
    // 스레드(메타데이터) + 첫 메시지(본문)가 repository.create 안에서 한 트랜잭션으로 생성된다.
    return await this.repository.create(serviceId, {
      content,
      status: getNextStatus(writerRole),
      opinionType,
      codeKind,
      location,
      writerRole,
      writerName,
    });
  }

  async findAll(serviceId?: string, status?: string) {
    // serviceId 필터는 repository(SQL WHERE)로 내려 전체 스캔을 방지한다.
    // (repo/mock 모두 조회 결과 키를 camelCase("serviceId","status")로 고정 반환하므로 대소문자 다중 대응은 불필요.)
    const threads = await this.repository.findAll(serviceId);

    // status: 'OPEN'(기본)=미해결만, 'RESOLVED'=완료만, 'ALL'=전체.
    const s = this.normalizeStatus(status);
    if (s === 'ALL') return threads;
    const isResolved = (t: { status: string }) => t.status === 'RESOLVED';
    return s === 'RESOLVED' ? threads.filter(isResolved) : threads.filter((t) => !isResolved(t));
  }

  // 'OPEN'(기본, 미해결) | 'RESOLVED'(완료) | 'ALL'(전체). 잘못된 값/미지정 → OPEN.
  private normalizeStatus(raw?: string): 'OPEN' | 'RESOLVED' | 'ALL' {
    return raw === 'RESOLVED' || raw === 'ALL' ? raw : 'OPEN';
  }

  // 분류별/글로벌 전체 + 페이징. 분류는 serviceId 목록으로 해석해 IN 조건으로 넘긴다.
  async findAllPaged(params: {
    bigCategory?: string;
    middleCategory?: string;
    opinionType?: string;
    status?: string;
    mySide?: string;
    page: number;
    size: number;
  }) {
    const { bigCategory, middleCategory, opinionType, status, mySide, page, size } = params;

    let serviceIds: string[] | undefined;
    if (bigCategory || middleCategory) {
      const services = await this.servicesService.findAll();
      const ids = new Set<string>();
      // 서비스 조회 결과 키는 repo/mock 모두 camelCase 로 고정 → 대소문자 다중 대응 불필요.
      for (const s of services) {
        if (bigCategory && s.bigCategory !== bigCategory) continue;
        if (middleCategory && s.middleCategory !== middleCategory) continue;
        if (s.serviceId) ids.add(s.serviceId);
      }
      serviceIds = Array.from(ids);
      if (serviceIds.length === 0) {
        return { items: [], page, size, totalCount: 0 };
      }
    }

    const { items, totalCount } = await this.repository.findPaged({ serviceIds, opinionType, status: this.normalizeStatus(status), mySide, page, size });
    return { items, page, size, totalCount };
  }

  async findOne(id: number) {
    const thread = await this.repository.findOne(id);
    if (!thread) throw new NotFoundException(`Thread #${id} not found`);
    return thread;
  }

  @Transactional()
  async update(id: number, content?: string, writerRole?: string) {
    if (content !== undefined && content.trim() === '') {
      throw new BadRequestException('Content cannot be empty');
    }
    await this.findOne(id); // 존재 여부 확인
    // 스레드는 상태만 갱신한다 (본문은 message 쪽에서 수정). writerRole 이 주어지면 상태 재계산.
    const status = writerRole ? getNextStatus(writerRole) : undefined;
    return await this.repository.update(id, { status });
  }
  async updateStatus(id: number, status: 'CHECK_PB' | 'CHECK_PB5' | 'RESOLVED') {
    await this.findOne(id); // 존재 여부 확인    
    return await this.repository.update(id, { status });
  }


  @Transactional()
  async remove(id: number) {
    return await this.repository.remove(id);
  }
  @Transactional()
  async closeThread(id: number) {
    const thread = await this.findOne(id); // 존재 여부 확인
    return await this.repository.update(id, { status: 'RESOLVED' });
  }

}