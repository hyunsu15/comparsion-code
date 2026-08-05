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
    @Query('status') status?: string,
    @Query('mySide') mySide?: string,
  ) {
    const pageNum = this.toPage(page);
    const sizeNum = this.toSize(size);
    return this.discussionThreadsService.findAllPaged({
      bigCategory: bigCategory || undefined,
      middleCategory: middleCategory || undefined,
      opinionType: opinionType || undefined,
      status,
      mySide: mySide || undefined,
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
