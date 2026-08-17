import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  recipientId!: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
