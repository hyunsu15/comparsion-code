import { Injectable } from '@nestjs/common';
import { IDiscussionThreadRepository, DiscussionThreadPageFilter, DiscussionThreadPage } from './discussion-thread.repository.interface';
import { CreateDiscussionThreadRepositoryDto, UpdateDiscussionThreadRepositoryDto } from './discussion-thread.repository.dto';
import { SQLTemplate } from '../../../db/SQLTemplate.js';
import { KST_NOW } from '../../../common/sql-expressions.js';

// 스레드 조회 뷰: 메타데이터(t) + '첫 메시지'(m)를 합쳐 B 뷰로 내려준다.
// 첫 메시지 = 해당 thread_id 중 가장 작은 id (가장 먼저 작성된 글 = 오프닝).
const THREAD_VIEW = `
  SELECT
    t.id          as "id",
    t.status      as "status",
    (SELECT lm.reaction
       FROM comparsion_discussion_message lm
      WHERE lm.thread_id = t.id
        AND lm.id = (SELECT MAX(im.id) FROM comparsion_discussion_message im
                      WHERE im.thread_id = t.id AND im.reaction IS NOT NULL)
    ) as "lastReaction",
    t.opinion_type as "opinionType",
    t.code_kind   as "codeKind",
    t.service_id  as "serviceId",
    t.location    as "location",
    t.resolved_at as "resolvedAt",
    t.created_at  as "createdAt",
    m.writer_role as "writerRole",
    m.writer_name as "writerName",
    m.content     as "content"
  FROM comparsion_discussion_thread t
  LEFT JOIN comparsion_discussion_message m
    ON m.thread_id = t.id
   AND m.id = (
     SELECT MIN(im.id)
     FROM comparsion_discussion_message im
     WHERE im.thread_id = t.id
   )
`;

@Injectable()
export class DiscussionThreadRepository extends SQLTemplate implements IDiscussionThreadRepository {
  // 스레드(메타데이터)와 첫 메시지(오프닝)를 함께 생성한다.
  // 호출하는 서비스 메서드가 @Transactional 이므로 두 INSERT 는 하나의 트랜잭션으로 원자 처리된다.
  async create(serviceId: string, dto: CreateDiscussionThreadRepositoryDto): Promise<any> {
    // 1) 스레드 메타데이터 생성
    const threadSql = `
      INSERT INTO comparsion_discussion_thread
        (status, opinion_type, code_kind, service_id, location, created_at)
      VALUES
        (:status, :opinionType, :codeKind, :serviceId, :location, ${KST_NOW})
      RETURNING id INTO :out_id
    `;
    const threadId = await this.insertAndReturnId(threadSql, {
      status: dto.status,
      opinionType: dto.opinionType,
      codeKind: dto.codeKind,
      serviceId: serviceId,
      location: dto.location,
    });

    // 2) 첫 메시지(스레드 본문) 생성 — 같은 트랜잭션
    const messageSql = `
      INSERT INTO comparsion_discussion_message
        (thread_id, writer_role, writer_name, content, created_at)
      VALUES
        (:threadId, :writerRole, :writerName, :content, ${KST_NOW})
    `;
    await super.update(messageSql, {
      threadId,
      writerRole: dto.writerRole,
      writerName: dto.writerName,
      content: dto.content,
    });

    return threadId;
  }

  async findAll(serviceId?: string): Promise<any[]> {
    // serviceId 가 있으면 WHERE 로 걸러 해당 서비스 스레드만 THREAD_VIEW(상관 서브쿼리 포함)를 계산한다.
    // (기존엔 전체 스레드를 조회한 뒤 서비스에서 JS 필터 → 전체 스캔 + 전량 서브쿼리 실행이었다.)
    if (serviceId) {
      const sql = `${THREAD_VIEW} WHERE t.service_id = :serviceId ORDER BY t.id DESC`;
      return await this.selectList(sql, { serviceId });
    }
    const sql = `${THREAD_VIEW} ORDER BY t.id DESC`;
    return await this.selectList(sql);
  }

  async findPaged(filter: DiscussionThreadPageFilter): Promise<DiscussionThreadPage> {
    const { serviceIds, opinionType, status, mySide, page, size } = filter;

    // 빈 스코프(serviceIds=[]) → 결과 없음. mock 과 동일 계약. (undefined 는 전역)
    if (serviceIds !== undefined && serviceIds.length === 0) {
      return { items: [], totalCount: 0 };
    }

    const where: string[] = [];
    // status: 'OPEN'(기본)=미해결만, 'RESOLVED'=완료만, 'ALL'=전체
    if (status === 'RESOLVED') where.push(`t.status = 'RESOLVED'`);
    else if (status !== 'ALL') where.push(`t.status <> 'RESOLVED'`);
    const binds: Record<string, any> = {};

    if (serviceIds && serviceIds.length > 0) {
      const names = serviceIds.map((_, i) => `:sid${i}`);
      where.push(`t.service_id IN (${names.join(', ')})`);
      serviceIds.forEach((id, i) => { binds[`sid${i}`] = id; });
    }
    if (opinionType) {
      where.push(`t.opinion_type = :opinionType`);
      binds.opinionType = opinionType;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // 총건수 — 조건이 모두 t 컬럼이라 JOIN 불필요
    const countSql = `
      SELECT COUNT(*) AS "cnt"
      FROM comparsion_discussion_thread t
      ${whereSql}
    `;
    const countRow = await this.selectOne(countSql, binds);
    const totalCount = Number(countRow?.cnt ?? 0);

    // 목록 — 기존 THREAD_VIEW(메타+첫 메시지) 재사용, SQL 페이징.
    // 정렬: ① 내 담당 '확인 필요'(:myCheckStatus) → ② 상대 '확인 필요' → ③ 그 외, 같은 그룹은 id DESC.
    const myCheckStatus = mySide ? `CHECK_${mySide.toUpperCase()}` : null;
    const offset = (page - 1) * size;
    const listSql = `
      ${THREAD_VIEW}
      ${whereSql}
      ORDER BY
        CASE
          WHEN t.status = :myCheckStatus THEN 0
          WHEN t.status IN ('CHECK_PB', 'CHECK_PB5') THEN 1
          ELSE 2
        END,
        t.id DESC
      OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
    `;
    // ⚠️ 바인드명에 Oracle 예약어 금지: :size(SIZE 예약어)는 ORA-01745 유발 → :pageSize 로 회피.
    const items = await this.selectList(listSql, { ...binds, offset, pageSize: size, myCheckStatus });

    return { items, totalCount };
  }

  async findOne(id: number): Promise<any> {
    const sql = `${THREAD_VIEW} WHERE t.id = :id`;
    return await this.selectOne(sql, { id });
  }

  async update(id: number, dto: UpdateDiscussionThreadRepositoryDto): Promise<number> {
    // 스레드는 상태만 갱신한다. RESOLVED 로 바뀌는 순간 resolved_at 을 KST 로 기록.
    const sql = `
      UPDATE comparsion_discussion_thread
      SET status = COALESCE(:status, status),
          resolved_at = CASE WHEN :status = 'RESOLVED' THEN ${KST_NOW} ELSE resolved_at END
      WHERE id = :id
    `;
    return await super.update(sql, { status: dto.status, id });
  }

  async remove(id: number): Promise<number> {
    // 메시지는 FK ON DELETE CASCADE 로 함께 삭제된다.
    const sql = `DELETE FROM comparsion_discussion_thread WHERE id = :id`;
    return await super.update(sql, { id });
  }
}
