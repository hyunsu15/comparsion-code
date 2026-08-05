import { IsIn, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateDiscussionThreadDto {
  // writerRole 의 pb/pb5 판별·대소문자 처리는 getNextStatus 가 담당하므로 여기선 비어있지 않은 문자열만 강제한다.
  @IsString()
  @IsNotEmpty()
  writerRole: string; // 작성자 측/역할: pb or pb5

  @IsString()
  @IsNotEmpty()
  writerName: string;

  @IsIn(['pb', 'pb5'])
  codeKind: 'pb' | 'pb5';

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsInt()
  location: number;

  @IsIn(['MISMATCH', 'OMISSION', 'EXPLANATION', 'BUSINESS_CHECK', 'ETC'])
  opinionType: 'MISMATCH' | 'OMISSION' | 'EXPLANATION' | 'BUSINESS_CHECK' | 'ETC'; // 의견 유형 (스레드 생성 시 필수)
}
