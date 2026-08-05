import { Injectable } from '@nestjs/common';
import { IChecklistRepository } from './checklist.repository.interface';
import { UpdateChecklistDto } from '../in/update-checklist.dto';
import { ChecklistItem, ChecklistStatus, CheckPointColumn, MatrixCell } from './checklist.entity';

// 점검 항목 마스터 — insert.sql 의 comparsion_check_point 와 동일(카테고리 제목 + 개별 문항 + 순서). 7카테고리 21문항.
const CHECK_POINTS: ReadonlyArray<{ id: number; checkPoint: string; detail: string; sortOrder: number }> = [
  { id: 1, sortOrder: 1, checkPoint: '기본 구조', detail: 'C 프로그램과 Java 프로그램의 대응 관계가 명확한가 (서비스/모듈/함수/래퍼 대응 관계)' },
  { id: 2, sortOrder: 2, checkPoint: '기본 구조', detail: 'C에는 있으나 Java에 없는 업무 로직이 있는가' },
  { id: 3, sortOrder: 3, checkPoint: '기본 구조', detail: 'C에는 없는데 Java에 추가된 업무 로직이 있는가' },
  { id: 4, sortOrder: 4, checkPoint: '입력값 처리', detail: '입력 전문 항목이 Java 입력 VO에 동일하게 반영되었는가' },
  { id: 5, sortOrder: 5, checkPoint: '입력값 처리', detail: '기본값, 필수값 처리가 동일한가' },
  { id: 6, sortOrder: 6, checkPoint: '입력값 처리', detail: 'blank, null, 0, 빈 문자열 처리 방식이 C와 동일한가' },
  { id: 7, sortOrder: 7, checkPoint: '업무 조건·분기', detail: '주요 if/switch 조건과 업무 판단 기준이 동일한가' },
  { id: 8, sortOrder: 8, checkPoint: '업무 조건·분기', detail: 'AND/OR 조건, 부등호가 동일하게 전환되었는가' },
  { id: 9, sortOrder: 9, checkPoint: '업무 조건·분기', detail: '특정 계좌, 특정 업무 구분에 대한 별도 처리가 동일한가' },
  { id: 10, sortOrder: 10, checkPoint: '계산 로직', detail: '금액, 수량, 단가, 비율 계산 방식이 동일한가' },
  { id: 11, sortOrder: 11, checkPoint: '계산 로직', detail: '반올림/절사 기준이 동일하게 적용되었는가' },
  { id: 12, sortOrder: 12, checkPoint: '계산 로직', detail: '절사 시 소수점 자리수가 동일하게 적용되었는가' },
  { id: 13, sortOrder: 13, checkPoint: '계산 로직', detail: 'BigDecimal 기준 수식 변환이 정확하게 이루어졌는가' },
  { id: 14, sortOrder: 14, checkPoint: '오류 처리', detail: '오류 발생 조건과 오류코드, 메시지가 동일한가' },
  { id: 15, sortOrder: 15, checkPoint: '오류 처리', detail: 'C의 return FAILURE가 exception 처리로 바르게 변환되었는가' },
  { id: 16, sortOrder: 16, checkPoint: '조회·데이터 처리', detail: 'C에서의 래퍼와 동일한 Mapper가 호출되는가' },
  { id: 17, sortOrder: 17, checkPoint: '조회·데이터 처리', detail: 'SQL 입력 조건, 정렬 기준, 최대 건수가 동일한가' },
  { id: 18, sortOrder: 18, checkPoint: '조회·데이터 처리', detail: '0건일 때 처리 방식이 동일한가' },
  { id: 19, sortOrder: 19, checkPoint: '출력값 세팅', detail: '주요 출력 항목, 리스트, count가 동일한가' },
  { id: 20, sortOrder: 20, checkPoint: '출력값 세팅', detail: '결과값이 없을 때 blank, 0, null 처리 방식이 동일한가' },
  { id: 21, sortOrder: 21, checkPoint: '출력값 세팅', detail: '결과값의 포맷이 동일한가? (타입, 자리수 등)' },
];

// 매트릭스용 프로그램 목록 — mock-service.repository 의 distinct service_id 와 동일하게 맞춘다.
const MOCK_PROGRAMS: ReadonlyArray<{ serviceId: string; bigCategory: string; middleCategory: string }> = [
  { serviceId: 'a', bigCategory: '회원', middleCategory: '인증' },
  { serviceId: 'b', bigCategory: '계좌', middleCategory: '이체' },
  { serviceId: 'ACCT001', bigCategory: '계좌', middleCategory: '신규' },
  { serviceId: 'ACCTMAP', bigCategory: '계좌', middleCategory: '쿼리매핑' },
  { serviceId: 'ACCT002', bigCategory: '계좌', middleCategory: '잔액조회' },
];

// 프로그램별 상태(check_list). 처음엔 비어 있고(=NONE 선택안함), 변경 시 행이 생긴다(업서트).
interface State {
  checkPointId: number;
  serviceId: string;
  status: ChecklistStatus;
  comment: string | null;
  updateDate: string | null;
}

@Injectable()
export class MockChecklistRepository implements IChecklistRepository {
  private states: State[] = [];

  private find(serviceId: string, checkPointId: number): State | undefined {
    return this.states.find((s) => s.serviceId === serviceId && s.checkPointId === checkPointId);
  }

  async findAllByService(serviceId: string): Promise<ChecklistItem[]> {
    return CHECK_POINTS.map((cp) => {
      const st = this.find(serviceId, cp.id);
      return {
        checkPointId: cp.id,
        checkPoint: cp.checkPoint,
        detail: cp.detail,
        sortOrder: cp.sortOrder,
        status: st ? st.status : 'NONE',
        comment: st ? st.comment : null,
        updateDate: st ? st.updateDate : null,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async upsertState(serviceId: string, checkPointId: number, dto: UpdateChecklistDto): Promise<number> {
    let st = this.find(serviceId, checkPointId);
    if (!st) {
      st = { checkPointId, serviceId, status: 'NONE', comment: null, updateDate: null };
      this.states.push(st);
    }
    if (dto.status !== undefined) st.status = dto.status;
    if (dto.comment !== undefined) st.comment = dto.comment ?? null;
    st.updateDate = new Date().toISOString();
    return 1;
  }

  async findAllCheckPoints(): Promise<CheckPointColumn[]> {
    return CHECK_POINTS.map((cp) => ({ checkPointId: cp.id, checkPoint: cp.checkPoint, detail: cp.detail }));
  }

  async findMatrixCells(): Promise<MatrixCell[]> {
    const cells: MatrixCell[] = [];
    for (const p of MOCK_PROGRAMS) {
      for (const cp of CHECK_POINTS) {
        const st = this.find(p.serviceId, cp.id);
        cells.push({
          serviceId: p.serviceId,
          bigCategory: p.bigCategory,
          middleCategory: p.middleCategory,
          checkPointId: cp.id,
          status: st ? st.status : 'NONE',
          comment: st ? st.comment : null,
        });
      }
    }
    return cells;
  }
}
