import { IsOptional, IsString } from 'class-validator';

export class AdminDailyMetricsQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  date?: string;
}
