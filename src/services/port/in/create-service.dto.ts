import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  serviceId: string; // 프로그램명

  @IsOptional()
  @IsString()
  bigCategory?: string; // 분류

  @IsOptional()
  @IsString()
  middleCategory?: string; // 업무

  @IsIn(['pb', 'pb5'])
  codeKind: 'pb' | 'pb5';

  @IsOptional()
  @IsString()
  fileName?: string;
}
