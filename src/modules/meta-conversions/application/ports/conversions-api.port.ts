export const CONVERSIONS_API = Symbol('CONVERSIONS_API');

export interface ConversionUser {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

// Lo implementa MetaConversionsClient (HTTP a graph.facebook.com).
export interface ConversionsApiPort {
  sendPurchase(params: {
    orderNumber: string;
    total: number;
    contentIds: string[];
    user: ConversionUser;
  }): Promise<void>;
  sendOfflinePurchase(params: {
    ventaId: string;
    total: number;
    user: ConversionUser;
    eventTime?: number;
  }): Promise<void>;
}
