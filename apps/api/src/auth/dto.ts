import { IsIn, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class DevLoginDto {
  @IsIn(['member-a', 'member-b', 'member-c'])
  member!: 'member-a' | 'member-b' | 'member-c';
}
