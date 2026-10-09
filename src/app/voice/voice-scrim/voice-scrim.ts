import { Component, inject, input } from '@angular/core';
import { VoiceStateService } from '../voice-state.service';

/** Dark overlay that dims the page behind the voice panel. Clicking it
 * closes the panel. It covers the whole screen by default; the parent sets
 * its z-index (and its box, to cover less) from its own styles. It stays in
 * the page while hidden so it can fade out. */
@Component({
  selector: 'app-voice-scrim',
  styleUrl: './voice-scrim.css',
  template: '',
  host: {
    'aria-hidden': 'true',
    '[class.visible]': 'visible()',
    '(click)': 'voice.closePanel()',
  },
})
export class VoiceScrim {
  voice = inject(VoiceStateService);

  visible = input(false);
}
