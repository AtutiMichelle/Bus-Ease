import { Component, input, output } from '@angular/core';
import { ICONS } from '../../admin-nav';
import { AdminIcon } from '../../icon/admin-icon';

/** Inline error for one dashboard widget, with a retry button. Lives inside
 * the widget's own card, so a failed query never affects the rest of the
 * page. */
@Component({
  imports: [AdminIcon],
  selector: 'app-widget-error',
  styleUrl: './widget-error.css',
  templateUrl: './widget-error.html',
})
export class WidgetError {
  message = input("Couldn't load this section.");
  retry = output<void>();

  readonly alertIcon = ICONS.alert;
}
