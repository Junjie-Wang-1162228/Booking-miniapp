import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  coachId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  coach!: string;

  @IsISO8601()
  startsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(240)
  durationMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  coachId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  coach?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(240)
  durationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;
}
