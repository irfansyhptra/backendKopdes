import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsOptional,
} from 'class-validator';

export enum ChatChannel {
  MARKETPLACE = 'MARKETPLACE',
  DELIVERY = 'DELIVERY',
  GENERAL = 'GENERAL',
}

export class ListConversationsQueryDto {
  @IsEnum(ChatChannel)
  @IsOptional()
  channel?: ChatChannel;
}

export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  /// Opsional agar pemanggil lama (mis. Admin) tetap dapat membuka chat umum.
  /// Bila dikirim, service memvalidasi pasangan role peserta di server.
  @IsEnum(ChatChannel)
  @IsOptional()
  channel?: ChatChannel;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
