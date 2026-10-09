import { Component, inject } from '@angular/core';
import { VoiceStateService } from '../voice-state.service';

/** Round floating mic button. Positioned by its parent (see VoiceDock). */
@Component({
  selector: 'app-voice-fab',
  styleUrl: './voice-fab.css',
  templateUrl: './voice-fab.html',
})
export class VoiceFab {
  voice = inject(VoiceStateService);
}
