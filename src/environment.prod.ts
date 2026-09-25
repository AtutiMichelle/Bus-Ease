export const environment = {
  production: true,
  supabase: {
    url: 'https://ienhcalrkdjfdamzqgaq.supabase.co',
    key: 'sb_publishable_Phvs7ujtgXXCmHpWoWDNUg_Y3SLqBDz'
  },

  /** PLACEHOLDER: the real production Travler API URL is not known yet.
   * Replace this before deploying, or every booking request will fail. */
  travlerApiUrl: 'https://TRAVLER-PRODUCTION-URL-NOT-SET.invalid/globalApi',

  assets: {
    paymentLogos: {
      mpesa: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/safaricom.png',
      airtelMoney: 'https://ienhcalrkdjfdamzqgaq.supabase.co/storage/v1/object/public/payment-logos/airtel.png'
    }
  }
};