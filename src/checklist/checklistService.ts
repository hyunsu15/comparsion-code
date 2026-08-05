// 체크리스트 API 클라이언트.
//  - 정의(제목 check_point + 세부문장 detail)는 check_point 마스터에서, 상태(status/메모)는 프로그램별로 합쳐 온다.
//  - 변경은 점검 항목(check_point_id) 단위 업서트(PATCH). 모아보기는 전 프로그램 매트릭스.
import { CHECKLIST_STATUSES, type ChecklistStatus } from './checklistStatus';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:50004';

// 백엔드 응답 행 계약(camelCase). any 대신 이 타입으로 매핑한다.
interface ChecklistItemApiRow {
  checkPointId: number;
  checkPoint: string;
  detail?: string | null;
  sortOrder?: number | null;
  status?: string | null;
  comment?: string | null;
  updateDate?: string | null;
}
interface MatrixColumnApiRow {
  checkPointId: number;
  checkPoint: string;
  detail?: string | null;
}
interface MatrixProgramApiRow {
  serviceId: string;
  bigCategory?: string | null;
  middleCategory?: string | null;
  statuses?: Record<number, ChecklistStatus>;
  comments?: Record<number, string>;
}

// 미지/빈 상태값은 유령 값으로 흘리지 않고 NONE 으로 좁힌다.
const toStatus = (v: unknown): ChecklistStatus =>
  (CHECKLIST_STATUSES as string[]).includes(v as string) ? (v as ChecklistStatus) : 'NONE';

export interface ChecklistItem {
  check_point_id: number; // 점검 항목 마스터 id (상태 갱신 키)
  check_point: string; // 카테고리 제목(첫 줄)
  detail: string | null; // 세부 점검 문장(여러 줄)
  sort_order: number;
  status: ChecklistStatus; // 예/아니오/해당없음/판단 보류
  comment: string | null; // 이 프로그램 메모
  update_date?: string;
}

// 부분 수정(상태/메모). 넘긴 필드만 갱신.
export interface ChecklistPatch {
  status?: ChecklistStatus;
  comment?: string;
}

// 모아보기 매트릭스
export interface ChecklistMatrixColumn {
  check_point_id: number;
  check_point: string;
  detail: string | null; // 세부 점검 문장(읽기 전용 카드에서 표시)
}
export interface ChecklistMatrixRow {
  service_id: string;
  big_category: string | null;
  middle_category: string | null;
  statuses: Record<number, ChecklistStatus>; // checkPointId → status (전체)
  comments: Record<number, string>; // checkPointId → 의견 (있는 것만, sparse)
}
export interface ChecklistMatrix {
  columns: ChecklistMatrixColumn[];
  rows: ChecklistMatrixRow[];
}

const mapItem = (item: ChecklistItemApiRow): ChecklistItem => ({
  check_point_id: item.checkPointId,
  check_point: item.checkPoint,
  detail: item.detail ?? null,
  sort_order: item.sortOrder ?? 0,
  status: toStatus(item.status),
  comment: item.comment ?? null,
  update_date: item.updateDate ?? undefined,
});

const checklistUrl = (serviceId: string, checkPointId?: number) => {
  const base = `${BASE_URL}/services/${encodeURIComponent(serviceId)}/checklist`;
  return checkPointId === undefined ? base : `${base}/${checkPointId}`;
};

export const checklistService = {
  /**
   * 특정 프로그램(service_id)의 점검 항목 + 상태를 모두 가져옵니다.
   */
  async getChecklist(serviceId: string): Promise<ChecklistItem[]> {
    // 프로그램 미선택(빈 serviceId)이면 요청하지 않는다. (/services//checklist 404 방지)
    if (!serviceId || !serviceId.trim()) return [];
    const response = await fetch(checklistUrl(serviceId));
    if (!response.ok) {
      throw new Error(`Failed to fetch checklist: ${response.statusText}`);
    }
    const data = (await response.json()) as ChecklistItemApiRow[];
    return data.map(mapItem);
  },

  /**
   * 점검 항목(check_point) 단위로 이 프로그램의 상태(status/메모)를 갱신(업서트)합니다.
   */
  async updateChecklistItem(serviceId: string, checkPointId: number, patch: ChecklistPatch): Promise<void> {
    if (!serviceId || !serviceId.trim()) {
      throw new Error('serviceId is required to update a checklist item');
    }
    const response = await fetch(checklistUrl(serviceId, checkPointId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error(`Failed to update checklist item: ${response.statusText}`);
    }
  },

  /**
   * 모아보기 매트릭스(전 프로그램 × 점검 항목 상태)를 가져옵니다.
   */
  async getMatrix(): Promise<ChecklistMatrix> {
    const response = await fetch(`${BASE_URL}/checklist/matrix`);
    if (!response.ok) {
      throw new Error(`Failed to fetch checklist matrix: ${response.statusText}`);
    }
    const data = (await response.json()) as { checkPoints?: MatrixColumnApiRow[]; programs?: MatrixProgramApiRow[] };
    return {
      columns: (data.checkPoints ?? []).map((c) => ({
        check_point_id: c.checkPointId,
        check_point: c.checkPoint,
        detail: c.detail ?? null,
      })),
      rows: (data.programs ?? []).map((p) => ({
        service_id: p.serviceId,
        big_category: p.bigCategory ?? null,
        middle_category: p.middleCategory ?? null,
        statuses: p.statuses ?? {},
        comments: p.comments ?? {},
      })),
    };
  },
};
