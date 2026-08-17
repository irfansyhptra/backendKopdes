import { IsString, IsNotEmpty } from 'class-validator';

export class AssignCourierDto {
  @IsString()
  @IsNotEmpty()
  courierId!: string;
}
