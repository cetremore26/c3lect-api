import { IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WebhookDataDto {
  @IsString()
  id: string;
}

export class WebhookPaymentDto {
  @IsString()
  type: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebhookDataDto)
  data: WebhookDataDto;
}
