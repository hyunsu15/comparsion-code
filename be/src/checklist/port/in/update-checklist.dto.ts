import { IsIn, IsOptional, IsString } from 'class-validator';

// 프로그램별 점검 '상태' 부분 수정 — 넘긴 필드만 갱신(업서트)된다.
export class UpdateChecklistDto {
  @IsOptional()
  @IsIn(['YES', 'NO', 'NA', 'HOLD', 'NONE'])
  status?: 'YES' | 'NO' | 'NA' | 'HOLD' | 'NONE'; // 예/아니오/해당없음/판단 보류/선택안함(미선택·기본값)

  @IsOptional()
  @IsString()
  comment?: string; // 프로그램별 메모 (DB 컬럼 comment_text)
}
