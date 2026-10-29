import type { WebhookNotification } from '../../../application/use-cases/handle-webhook.use-case';
import { IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WebhookDataDto {
  @IsString()
  @MaxLength(150)
  id: string;
}

export class WebhookPaymentDto implements WebhookNotification {
  @IsString()
  @MaxLength(150)
  type: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebhookDataDto)
  data: WebhookDataDto;
}
