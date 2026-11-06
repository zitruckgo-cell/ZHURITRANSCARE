export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
  features: string[];
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  {
    id: 'prod_VFriKmsAp0WaIp',
    priceId: 'price_1UFLz31snZ3NduRVCwuKjQ7b',
    name: 'Zhuri Transcare Delivery Services',
    description: 'Emergency Medical Deliveries and others goods.',
    mode: 'payment',
    features: [
      'HIPAA-compliant medical deliveries',
      'Temperature-controlled transport options',
      'Real-time tracking & status updates',
      'Emergency and priority handling',
      'Proof of delivery with photo & signature',
      'Nationwide service coverage',
    ],
  },
];