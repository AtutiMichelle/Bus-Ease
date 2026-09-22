import { Component, computed, input, output } from '@angular/core';

/** Page controls for an admin list/table. Purely presentational: the page
 * owns the current page number and slices its own filtered array, this just
 * shows "X–Y of Z" and emits the page to move to. Hides itself when
 * everything already fits on one page. */
@Component({
  selector: 'app-admin-pagination',
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
})
export class AdminPagination {
  page = input.required<number>();
  pageSize = input.required<number>();
  totalItems = input.required<number>();
  pageChange = output<number>();

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  rangeStart = computed(() => (this.totalItems() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.totalItems()));

  goPrev(): void {
    if (this.page() > 1) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  goNext(): void {
    if (this.page() < this.totalPages()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}
