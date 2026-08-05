import { Injectable, NotFoundException, Inject, BadRequestException } from '@nestjs/common';
import type { IDiscussionMessageRepository } from './port/out/discussion-message.repository.interface';
import { DiscussionThreadsService } from '../discussion-threads/discussion-threads.service';
import { Transactional } from '../db/Transaction.decorator';
import { getNextStatus } from 'src/nextChecker';

@Injectable()
export class DiscussionMessageService {
  constructor(
    @Inject('DISCUSSION_MESSAGE_REPOSITORY')
    private readonly repository: IDiscussionMessageRepository,
    // DiscussionThreadsService를 주입받습니다.
    private readonly discussionThreadsService: DiscussionThreadsService,
  ) {}

  @Transactional()
  async create(threadId: number, writerRole: 'pb' | 'pb5', writerName: string, content: string) {
    const thread = await this.discussionThreadsService.findOne(threadId);
    if (!content || content.trim() === '') {
      throw new BadRequestException('Content cannot be empty');
    }
    if (!writerName || writerName.trim() === '') {
      throw new BadRequestException('Writer name cannot be empty');
    }
    // [status 갱신 책임 ②] 메시지(답글) 추가 시점 — 방금 글쓴이(writerRole)로 스레드 상태를 갱신한다.
    // 스레드 생성(①)과 이곳(②), 두 지점에서만 status 를 건드린다.
    thread.status = this.getStatus({ writerRole });
    // ⚠️ @Transactional 안에서는 모든 SQL이 트랜잭션의 '단일 커넥션'을 공유한다.
    //    Promise.all 로 두 SQL을 동시에 실행하면 같은 커넥션에서 동시 호출이 되어
    //    Oracle(node-oracledb)에서 'connection busy'(NJS-087)로 실패한다. → 순차 실행한다.
    await this.discussionThreadsService.updateStatus(threadId, thread.status);
    const createdMessage = await this.repository.create(threadId, {
      writerRole,
      writerName,
      content,
    });

    return createdMessage;
  }
  private getStatus(message: { writerRole: string }) {
    return getNextStatus(message.writerRole);
  }

  async findAll(threadId: number) {
    const [thread, messages] = await Promise.all([
      this.discussionThreadsService.findOne(threadId),
      this.repository.findAll(threadId)
    ]);
    return messages;
  }

  async findOne(threadId: number, id: number) {
    return await this.getMessage(threadId, id);
  }
   private async getMessage(threadId: number, id: number) {
    // ⚠️ update/remove 는 @Transactional 이라 모든 SQL 이 트랜잭션의 '단일 커넥션'을 공유한다.
    //    Promise.all 로 두 조회를 동시에 실행하면 같은 커넥션에서 동시 호출이 되어
    //    node-oracledb 가 'connection busy'(NJS-087)로 실패한다(create 주석과 동일 함정). → 순차 await.
    //    스레드 존재 확인을 먼저 수행해 '스레드 없음' 404 의미를 그대로 보존한다.
    await this.discussionThreadsService.findOne(threadId); // 스레드 없으면 NotFound
    const message = await this.repository.findOne(threadId, id);
    if (!message) {
      throw new NotFoundException(`Message #${id} not found in thread #${threadId}`);
    }
    return message;
  }

  @Transactional()
  async update(threadId: number, id: number, content?: string, writerRole?: 'pb' | 'pb5') {
    if (content !== undefined && content.trim() === '') {
      throw new BadRequestException('Content cannot be empty');
    }
    if (!writerRole) {
      throw new BadRequestException('Writer role is required');
    }
    const message = await this.findOne(threadId, id);
    if (writerRole !== message.writerRole.toLowerCase()) {
      throw new BadRequestException('Writer role does not match');
    }

    return await this.repository.update(threadId, id, { content });
  }

  @Transactional()
  async remove(threadId: number, id: number) {
    await this.findOne(threadId, id);
    return await this.repository.remove(threadId, id);
  }

  // 메시지(댓글) 처리 리액션 갱신 — null 은 해제(미설정). 스레드 제목의 '마지막 리액션'은 이 값에서 파생된다.
  async updateReaction(threadId: number, id: number, reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null) {
    const VALID = ['REVIEWING', 'DONE', 'SKIP'];
    if (reaction !== null && !VALID.includes(reaction)) {
      throw new BadRequestException('reaction must be one of REVIEWING, DONE, SKIP or null');
    }
    await this.findOne(threadId, id); // 존재 확인 (없으면 NotFound)
    return await this.repository.updateReaction(threadId, id, reaction);
  }
}
