// 점검 상태 5값: 선택안함/예/아니오/해당없음/판단 보류
export type ChecklistStatus = 'NONE' | 'YES' | 'NO' | 'NA' | 'HOLD';

// 조회 응답 1행 = 점검 항목(마스터 check_point) + 그 프로그램의 상태(check_list, LEFT JOIN).
export class ChecklistItem {
  checkPointId: number; // comparsion_check_point.id
  checkPoint: string; // 점검 카테고리(제목)
  detail: string | null; // 세부 점검 문장(여러 줄)
  sortOrder: number;
  status: ChecklistStatus; // 상태 행이 없으면 'NONE'(선택안함)
  comment: string | null; // 프로그램별 메모
  updateDate: string | null;
}

// 모아보기 매트릭스용 — 컬럼(점검 항목) / 셀(프로그램×항목 상태+의견)
export interface CheckPointColumn {
  checkPointId: number;
  checkPoint: string;
  detail: string | null; // 세부 점검 문장(카드에서 표시)
}
export interface MatrixCell {
  serviceId: string;
  bigCategory: string | null;
  middleCategory: string | null;
  checkPointId: number;
  status: ChecklistStatus;
  comment: string | null; // 프로그램별 의견(읽기 전용 표시)
}
