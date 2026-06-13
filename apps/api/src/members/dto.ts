import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';

const phonePattern = /^1[3-9]\d{9}$/;

export class AdminMemberQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class AdminMemberLedgerQueryDto {
  @IsString()
  branchId!: string;
}

export class CreateMemberDto {
  @IsString()
  branchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Matches(phonePattern, { message: 'phone must be a valid mainland China mobile number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  memberNo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  initialLessons?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatOpenid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatUnionid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatAppId?: string;
}

export class UpdateMemberDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(phonePattern, { message: 'phone must be a valid mainland China mobile number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  memberNo?: string;
}

export class BindWechatDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatOpenid?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'bindingCode must be a 6 digit code' })
  bindingCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatUnionid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatAppId?: string;
}

export class UnbindWechatDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  wechatAppId?: string;
}

export class AdjustLessonBalanceDto {
  @IsString()
  branchId!: string;

  @IsInt()
  @Min(-999)
  @Max(999)
  @NotEquals(0, { message: 'delta must not be 0' })
  delta!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}
