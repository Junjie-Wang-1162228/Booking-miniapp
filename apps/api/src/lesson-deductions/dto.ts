import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeductLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminCancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AdminBookingQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  status?: 'BOOKED' | 'CANCELED';

  @IsOptional()
  @IsString()
  q?: string;
}
