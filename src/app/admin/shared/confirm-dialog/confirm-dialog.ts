import { Component, HostListener, input, output } from '@angular/core';

/** A modal confirmation for a destructive action (delete a route, cancel a
 * trip), with its own busy and error state so the caller doesn't need one.
 * The caller decides what "confirm" does and reports back with markBusy /
 * markError; this component never assumes the action succeeded. */
@Component({
  selector: 'app-confirm-dialog',
  styleUrl: './confirm-dialog.css',
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  title = input.required<string>();
  message = input.required<string>();
  confirmLabel = input('Delete');
  busy = input(false);
  error = input('');

  confirm = output<void>();
  cancel = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.busy()) {
      this.cancel.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.busy()) {
      this.cancel.emit();
    }
  }
}
