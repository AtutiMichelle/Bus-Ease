export const environment = {
  production: false,
  supabase: {
    url: 'https://ienhcalrkdjfdamzqgaq.supabase.co',
    key: 'sb_publishable_Phvs7ujtgXXCmHpWoWDNUg_Y3SLqBDz'
  },

  /** Where trips, seats and bookings come from: 'travler' (the booking API
   * at travlerApiUrl) or 'supabase' (BusEase's own buses tables). */
  tripProvider: 'travler' as 'travler' | 'supabase',

  /** Travler booking API. In development this is the local mock server
   * (run it separately with `npm start` in the mock project). */
  travlerApiUrl: 'http://localhost:4010/globalApi',

  assets: {
    paymentLogos: {
      mpesa: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/safaricom.png',
      airtelMoney: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/airtel.png'
    }
  }
};