import { Component, input } from '@angular/core';

/** Draws one of the inline SVG icons from admin-nav.ts (ICONS). It is
 * decorative: put an aria-label on the button or link that holds it. Size it
 * from the parent with width and height on the app-admin-icon element. */
@Component({
  selector: 'app-admin-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @for (d of paths(); track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }

    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class AdminIcon {
  paths = input.required<readonly string[]>();
}
