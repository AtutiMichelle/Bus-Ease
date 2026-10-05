export const environment = {
  production: true,
  supabase: {
    url: 'https://ienhcalrkdjfdamzqgaq.supabase.co',
    key: 'sb_publishable_Phvs7ujtgXXCmHpWoWDNUg_Y3SLqBDz'
  },

  /** Where trips, seats and bookings come from: 'travler' (the booking API
   * at travlerApiUrl) or 'supabase' (BusEase's own buses tables). */
  tripProvider: 'travler' as 'travler' | 'supabase',

  /** The `travler` edge function, which forwards to the real Travler API.
   * The real API address and key are Supabase secrets (TRAVLER_API_URL,
   * TRAVLER_API_KEY), see supabase/functions/travler/index.ts. */
  travlerApiUrl: 'https://ienhcalrkdjfdamzqgaq.supabase.co/functions/v1/travler',

  assets: {
    paymentLogos: {
      mpesa: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/safaricom.png',
      airtelMoney: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/airtel.png'
    }
  }
};