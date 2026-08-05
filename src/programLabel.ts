import type { ServiceInfo } from './discussionService';
import { resolveProgramFileName } from './methodJump';

/**
 * 소스 비교 탭(CategorySelector)과 동일한 프로그램 표기를 만든다.
 *   "PB소스파일명 / 프로그램ID"  (PB 소스를 못 구하면 프로그램ID만)
 *   예) ACCT001 → "ACCT001_APS.pc / ACCT001"
 *
 * pbSourceName 은 그 프로그램의 pb 행(file_name + big_category)으로 도출한다.
 * services 에 없거나 pb 소스를 못 구하면 serviceId 를 그대로 돌려준다.
 */
export const formatProgramLabel = (serviceId: string, services: ServiceInfo[]): string => {
  const pbRow = services.find((s) => s.service_id === serviceId && s.code_kind === 'pb');
  const pbSourceName = resolveProgramFileName('pb', pbRow?.big_category, pbRow?.file_name);
  return pbSourceName ? `${pbSourceName} / ${serviceId}` : serviceId;
};
