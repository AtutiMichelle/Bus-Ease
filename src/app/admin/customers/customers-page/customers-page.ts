import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCustomersService } from '../../../services/admin-customers.service';
import { AdminCustomer } from '../../../models/admin-customer.model';
import { AdminIcon } from '../../icon/admin-icon';
import { WidgetError } from '../../dashboard/widget-error/widget-error';
import { AdminPagination } from '../../shared/pagination/pagination';
import { ICONS } from '../../admin-nav';
import { formatKsh } from '../../../utils/money';

@Component({
  imports: [FormsModule, AdminIcon, WidgetError, AdminPagination],
  selector: 'app-customers-page',
  styleUrl: './customers-page.css',
  templateUrl: './customers-page.html',
})
export class CustomersPage {
  private customersService = inject(AdminCustomersService);

  readonly icons = ICONS;
  readonly formatKsh = formatKsh;
  readonly pageSize = 10;

  customers = signal<AdminCustomer[]>([]);
  loading = signal(true);
  error = signal(false);
  searchQuery = signal('');
  page = signal(1);

  filteredCustomers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.customers();
    }
    return this.customers().filter(
      (customer) => customer.name.toLowerCase().includes(query) || customer.email.toLowerCase().includes(query),
    );
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredCustomers().length / this.pageSize)));
  currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  pagedCustomers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredCustomers().slice(start, start + this.pageSize);
  });

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  emptyMessage = computed(() =>
    this.searchQuery().trim() ? 'No customers match your search.' : 'No customers yet. Accounts will show up here as people sign up.',
  );

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.customers.set(await this.customersService.list());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string | null): string {
    if (!value) {
      return 'Never';
    }
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
