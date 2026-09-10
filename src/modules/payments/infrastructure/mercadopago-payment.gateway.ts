import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MercadoPagoConfig,
  Preference,
  Payment as MpPayment,
} from 'mercadopago';
import {
  CreatePreferenceParams,
  MpPaymentStatus,
  PaymentGatewayPort,
  PreferenceResult,
} from '../application/ports/payment-gateway.port';

@Injectable()
export class MercadoPagoPaymentGateway implements PaymentGatewayPort {
  constructor(private readonly config: ConfigService) {}

  private client(): MercadoPagoConfig {
    const accessToken = this.config.getOrThrow<string>('MP_ACCESS_TOKEN');
    return new MercadoPagoConfig({ accessToken });
  }

  async createPreference(
    params: CreatePreferenceParams,
  ): Promise<PreferenceResult> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const apiUrl = this.config.getOrThrow<string>('API_URL');

    const preference = new Preference(this.client());
    const prefResult = await preference.create({
      body: {
        items: params.items.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'COP',
        })),
        payer: { email: params.payerEmail },
        external_reference: params.externalReference,
        back_urls: {
          success: `${frontendUrl}/checkout/success`,
          failure: `${frontendUrl}/checkout/failure`,
          pending: `${frontendUrl}/checkout/pending`,
        },
        notification_url: `${apiUrl}/payments/webhook`,
        statement_descriptor: 'C3LECT',
      },
    });

    return {
      preferenceId: prefResult.id,
      checkoutUrl: prefResult.init_point ?? prefResult.sandbox_init_point ?? '',
    };
  }

  async getPayment(mpPaymentId: string): Promise<MpPaymentStatus> {
    const mpPaymentClient = new MpPayment(this.client());
    const mpPayment = await mpPaymentClient.get({ id: mpPaymentId });
    return {
      status: mpPayment.status,
      externalReference: mpPayment.external_reference,
    };
  }
}
