export class ServiceInfo {
  serviceId: string; // 프로그램명 (소분류 역할: 비교 대상 선택 키)
  bigCategory: string | null; // 분류
  middleCategory: string | null; // 업무
  codeKind: 'pb' | 'pb5';
  fileName: string | null;
}
