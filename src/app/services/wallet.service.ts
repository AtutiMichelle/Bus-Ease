import { Injectable, inject } from '@angular/core';
import { Supabase } from './supabase';
import { AuthService } from './auth.service';
import { WalletTransaction } from '../models/wallet.model';

interface WalletTransactionRow {
  id: string;
  type: 'topup' | 'payment';
  amount: string | number;
  description: string;
  related_booking_id: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private client = inject(Supabase).getClient();
  private authService = inject(AuthService);

  async getBalance(): Promise<number> {
    const user = this.authService.user();
    if (!user) {
      return 0;
    }

    const { data, error } = await this.client
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      throw error;
    }

    return Number(data?.balance ?? 0);
  }

  async getTransactions(): Promise<WalletTransaction[]> {
    const user = this.authService.user();
    if (!user) {
      return [];
    }

    const { data, error } = await this.client
      .from('wallet_transactions')
      .select('id, type, amount, description, related_booking_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }

    return ((data ?? []) as WalletTransactionRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
      relatedBookingId: row.related_booking_id,
      createdAt: row.created_at,
    }));
  }
}
