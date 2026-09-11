export type WalletTransactionType = 'topup' | 'payment';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: number;
  description: string;
  relatedBookingId: string | null;
  createdAt: string;
}
