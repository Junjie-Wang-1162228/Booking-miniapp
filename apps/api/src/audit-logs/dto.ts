import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminAuditLogQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
