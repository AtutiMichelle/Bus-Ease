import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminRoutesService } from '../../../services/admin-routes.service';
import { AdminRoute } from '../../../models/admin-fleet.model';
import { RouteForm } from '../route-form/route-form';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { AdminIcon } from '../../icon/admin-icon';
import { WidgetError } from '../../dashboard/widget-error/widget-error';
import { ICONS } from '../../admin-nav';

@Component({
  imports: [FormsModule, RouteForm, ConfirmDialog, AdminIcon, WidgetError],
  selector: 'app-routes-page',
  styleUrl: './routes-page.css',
  templateUrl: './routes-page.html',
})
export class RoutesPage {
  private routesService = inject(AdminRoutesService);

  readonly icons = ICONS;

  routes = signal<AdminRoute[]>([]);
  loading = signal(true);
  error = signal(false);
  searchQuery = signal('');

  formTarget = signal<AdminRoute | 'new' | null>(null);
  deleteTarget = signal<AdminRoute | null>(null);
  deleteBusy = signal(false);
  deleteError = signal('');

  filteredRoutes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.routes();
    }
    return this.routes().filter((route) => `${route.origin} ${route.destination}`.toLowerCase().includes(query));
  });

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }

  emptyMessage = computed(() =>
    this.searchQuery().trim() ? 'No routes match your search.' : 'No routes yet. Add your first route to get started.',
  );

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.routes.set(await this.routesService.list());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.formTarget.set('new');
  }

  openEdit(route: AdminRoute): void {
    this.formTarget.set(route);
  }

  closeForm(): void {
    this.formTarget.set(null);
  }

  onSaved(): void {
    this.formTarget.set(null);
    this.load();
  }

  formRoute(): AdminRoute | null {
    const target = this.formTarget();
    return target === 'new' || target === null ? null : target;
  }

  confirmDelete(route: AdminRoute): void {
    this.deleteError.set('');
    this.deleteTarget.set(route);
  }

  cancelDelete(): void {
    if (this.deleteBusy()) {
      return;
    }
    this.deleteTarget.set(null);
  }

  async performDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.deleteBusy.set(true);
    this.deleteError.set('');
    try {
      await this.routesService.delete(target.id);
      this.deleteTarget.set(null);
      this.load();
    } catch (err) {
      this.deleteError.set(err instanceof Error ? err.message : 'Could not delete the route. Please try again.');
    } finally {
      this.deleteBusy.set(false);
    }
  }
}
