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
 * `slot` is for a full-height side panel, such as the seat map, whose
 * content must stay in view while the user answers. The mic sits at the
 * bottom right of the nearest positioned ancestor. The open chat goes
 * beside the side panel on a wide screen, and on a narrow one becomes a
 * short strip in the slot itself, so it never covers what is being chosen. */
@Component({
  imports: [VoiceFab, VoicePanel],
  selector: 'app-voice-dock',
  styleUrl: './voice-dock.css',
  templateUrl: './voice-dock.html',
  host: {
    '[class.in-slot]': "anchor() === 'slot'",
    '[class.open]': 'voice.open()',
  },
})
export class VoiceDock {
  voice = inject(VoiceStateService);

  anchor = input<'viewport' | 'slot'>('viewport');
}
