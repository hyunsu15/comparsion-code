import { IsIn, IsOptional } from 'class-validator';

// 메시지(댓글) 처리 리액션 변경 요청. status 와 별개 축이며 null 은 해제(미설정).
export class UpdateReactionDto {
  // null(해제)은 허용값이므로 @IsOptional 로 null/미지정 시 검증을 건너뛰고, 값이 있으면 3종만 허용한다.
  @IsOptional()
  @IsIn(['REVIEWING', 'DONE', 'SKIP'])
  reaction: 'REVIEWING' | 'DONE' | 'SKIP' | null;
}
