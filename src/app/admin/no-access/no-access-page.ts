import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StaffService } from '../../services/staff.service';
import { firstOpenableItem } from '../admin-nav';

/** Shown when a staff member opens an admin page their role doesn't include,
 * or has a role with no access set up at all. It fires no data requests, so
 * it can never show an error. */
@Component({
  imports: [RouterLink],
  selector: 'app-no-access-page',
  styleUrl: './no-access-page.css',
  templateUrl: './no-access-page.html',
})
export class NoAccessPage {
  private staff = inject(StaffService);

  roleLabel = this.staff.roleLabel;

  /** A page this role can open, to offer as the way out. */
  openableItem = computed(() => firstOpenableItem(this.staff.sections()));
}
