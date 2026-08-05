import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDiscussionMessageDto {
  // writerRole 의 pb/pb5 판별은 상위(getNextStatus/서비스)에서 처리 → 여기선 비어있지 않은 문자열만 강제.
  @IsString()
  @IsNotEmpty()
  writerRole: 'pb' | 'pb5'; // 작성자 측/역할 (작성자 식별이 아님)

  @IsString()
  @IsNotEmpty()
  writerName: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
