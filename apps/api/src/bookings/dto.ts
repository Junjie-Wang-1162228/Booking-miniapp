import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  classId!: string;

  @IsString()
  @MinLength(1)
  branchId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([60, 120, 180, 1440])
  remindBeforeMinutes?: number;
}
