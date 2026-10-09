import { Component, inject, input } from '@angular/core';
import { VoiceStateService } from '../voice-state.service';
import { VoiceFab } from '../voice-fab/voice-fab';
import { VoicePanel } from '../voice-panel/voice-panel';

/** The floating mic with the voice panel docked above it.
 *
 * `viewport` pins it to the bottom right of the screen. On phones the mic
 * sits in a slim bar across the bottom instead, so page content scrolls
 * behind the bar and is never half hidden under a floating button.
 *
 * `slot` pins it to the bottom right of the nearest positioned ancestor,
 * for a full-height side panel that has its own footer to stay clear of. */
@Component({
  imports: [VoiceFab, VoicePanel],
  selector: 'app-voice-dock',
  styleUrl: './voice-dock.css',
  templateUrl: './voice-dock.html',
  host: {
    '[class.in-slot]': "anchor() === 'slot'",
  },
})
export class VoiceDock {
  voice = inject(VoiceStateService);

  anchor = input<'viewport' | 'slot'>('viewport');
}
