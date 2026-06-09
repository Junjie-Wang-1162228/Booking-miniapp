import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  classId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([60, 120, 180, 1440])
  remindBeforeMinutes?: number;
}
