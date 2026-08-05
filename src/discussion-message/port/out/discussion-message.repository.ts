import { Injectable } from '@nestjs/common';
import { IDiscussionMessageRepository } from './discussion-message.repository.interface';
import { CreateDiscussionMessageDto } from '../in/create-discussion-message.dto';
import { UpdateDiscussionMessageDto } from '../in/update-discussion-message.dto.js';
import { SQLTemplate } from '../../../db/SQLTemplate.js';
import { KST_NOW } from '../../../common/sql-expressions.js';

// 조회 시 공통으로 사용하는 컬럼 목록 (DB snake_case → camelCase 별칭)
const MESSAGE_COLUMNS = `
  id          as "id",
  thread_id   as "threadId",
  writer_role as "writerRole",
  writer_name as "writerName",
  content     as "content",
  reaction    as "reaction",
  created_at  as "createdAt"
`;

@Injectable()
export class DiscussionMessageRepository extends SQLTemplate implements IDiscussionMessageRepository {

  async create(threadId: number, dto: CreateDiscussionMessageDto): Promise<any> {
    const sql = `
      INSERT INTO comparsion_discussion_message
        (thread_id, writer_role, writer_name, content, created_at)
      VALUES
        (:threadId, :writerRole, :writerName, :content, ${KST_NOW})
      RETURNING id INTO :out_id
    `;
    const binds = {
      threadId,
      writerRole: dto.writerRole,
      writerName: dto.writerName,
      content: dto.content,
    };
    return await this.insertAndReturnId(sql, binds);
  }

  async findAll(threadId: number): Promise<any[]> {
    const sql = `
      SELECT ${MESSAGE_COLUMNS}
      FROM comparsion_discussion_message
      WHERE thread_id = :threadId
      ORDER BY created_at ASC
    `;
    return await this.selectList(sql, { threadId });
  }

  async findOne(threadId: number, id: number): Promise<any> {
    const sql = `
      SELECT ${MESSAGE_COLUMNS}
      FROM comparsion_discussion_message
      WHERE thread_id = :threadId AND id = :id
    `;
    return await this.selectOne(sql, { threadId, id });
  }

  async update(threadId: number, id: number, dto: UpdateDiscussionMessageDto): Promise<number> {
    const sql = `
      UPDATE comparsion_discussion_message
      SET content = :content
      WHERE thread_id = :threadId AND id = :id
    `;
    return await super.update(sql, { content: dto.content, threadId, id });
  }

  async remove(threadId: number, id: number): Promise<number> {
    const sql = `
      DELETE FROM comparsion_discussion_message
      WHERE thread_id = :threadId AND id = :id
    `;
    return await super.update(sql, { threadId, id });
  }

  async updateReaction(threadId: number, id: number, reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null): Promise<number> {
    // 리액션은 null 해제(미설정)도 가능하므로 COALESCE 없이 직접 대입한다.
    const sql = `
      UPDATE comparsion_discussion_message
      SET reaction = :reaction
      WHERE thread_id = :threadId AND id = :id
    `;
    return await super.update(sql, { reaction, threadId, id });
  }
}
