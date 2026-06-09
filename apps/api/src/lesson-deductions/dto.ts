import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeductLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminBookingQueryDto {
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
