import { Injectable } from '@nestjs/common';
import { IDiscussionMessageRepository } from './discussion-message.repository.interface';
import { CreateDiscussionMessageDto } from '../in/create-discussion-message.dto';
import { UpdateDiscussionMessageDto } from '../in/update-discussion-message.dto';

@Injectable()
export class MockDiscussionMessageRepository implements IDiscussionMessageRepository {
  private messages: Array<{ id: number; threadId: number; writerRole: string; writerName: string; content: string; reaction?: 'REVIEWING' | 'DONE' | 'SKIP' | null; createdAt: Date }> = [
    { id: 1, threadId: 1, writerRole: 'pb', writerName: '김피비오', content: '첫 번째 쓰레드의 시작 메시지입니다.', createdAt: new Date('2023-10-27T10:00:00') },
    { id: 2, threadId: 1, writerRole: 'pb5', writerName: '박오세대', content: '네, 확인했습니다. 슬랙이랑 비슷하네요.', createdAt: new Date('2023-10-27T10:05:00') },
    { id: 3, threadId: 1, writerRole: 'pb', writerName: '김피비오', content: '길이 제한 없는 텍스트 테스트 중입니다. '.repeat(5), createdAt: new Date('2023-10-27T10:10:00') },
    { id: 4, threadId: 2, writerRole: 'pb', writerName: '이피비', content: '두 번째 토론 쓰레드입니다.', createdAt: new Date('2023-10-27T11:00:00') },
    { id: 5, threadId: 2, writerRole: 'pb5', writerName: '박오세대', content: 'status를 CHECK_PB로 변경해야 할까요?', createdAt: new Date('2023-10-27T11:02:00') },
    { id: 6, threadId: 2, writerRole: 'pb', writerName: '이피비', content: '네, 그렇게 진행해주세요.', createdAt: new Date('2023-10-27T11:05:00') },
    { id: 7, threadId: 3, writerRole: 'pb5', writerName: '김피비오', content: 'RESOLVED 상태 테스트입니다.', createdAt: new Date('2023-10-27T12:00:00') },
    { id: 8, threadId: 3, writerRole: 'pb', writerName: '김피비오', content: '종료된 쓰레드에도 메시지를 남길 수 있나요?', createdAt: new Date('2023-10-27T12:01:00') },
    { id: 9, threadId: 1, writerRole: 'pb5', writerName: '박오세대', content: '다시 첫 번째 쓰레드로 돌아왔습니다.', reaction: 'REVIEWING', createdAt: new Date('2023-10-27T13:00:00') },
    { id: 10, threadId: 2, writerRole: 'pb5', writerName: '박오세대', content: '마지막 10번째 예시 데이터입니다.', reaction: 'DONE', createdAt: new Date('2023-10-27T14:00:00') },
  ];

  private nextId = 11;

  async create(threadId: number, dto: CreateDiscussionMessageDto): Promise<any> {
    const newMessage = {
      id: this.nextId++,
      threadId,
      writerRole: dto.writerRole || 'pb',
      writerName: dto.writerName || '',
      content: dto.content,
      reaction: null,
      createdAt: new Date(), // 실제 환경에서는 DB가 한국시간으로 처리
    };
    this.messages.push(newMessage);
    return newMessage.id;
  }

  async findAll(threadId: number): Promise<any[]> {
    return this.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findOne(threadId: number, id: number): Promise<any> {
    return this.messages.find((m) => m.threadId === threadId && m.id === id);
  }

  async update(threadId: number, id: number, dto: UpdateDiscussionMessageDto): Promise<number> {
    const index = this.messages.findIndex((m) => m.threadId === threadId && m.id === id);
    if (index === -1) return 0;

    if (dto.content) {
      this.messages[index].content = dto.content;
    }
    return 1;
  }

  async remove(threadId: number, id: number): Promise<number> {
    const initialLength = this.messages.length;
    this.messages = this.messages.filter((m) => !(m.threadId === threadId && m.id === id));
    return initialLength - this.messages.length;
  }

  async updateReaction(threadId: number, id: number, reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null): Promise<number> {
    const index = this.messages.findIndex((m) => m.threadId === threadId && m.id === id);
    if (index === -1) return 0;
    this.messages[index].reaction = reaction;
    return 1;
  }
}
