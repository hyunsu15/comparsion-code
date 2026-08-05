import { CreateDiscussionMessageDto } from '../in/create-discussion-message.dto';
import { UpdateDiscussionMessageDto } from '../in/update-discussion-message.dto';

export interface IDiscussionMessageRepository {
  create(threadId: number, dto: CreateDiscussionMessageDto): Promise<any>;
  findAll(threadId: number): Promise<any[]>;
  findOne(threadId: number, id: number): Promise<any>;
  update(threadId: number, id: number, dto: UpdateDiscussionMessageDto): Promise<number>;
  updateReaction(threadId: number, id: number, reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null): Promise<number>;
  remove(threadId: number, id: number): Promise<number>;
}