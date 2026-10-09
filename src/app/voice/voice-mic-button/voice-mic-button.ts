import { Component, inject } from '@angular/core';
import { VoiceStateService } from '../voice-state.service';

/** Square mic button that sits inline in a form row, next to its submit
 * button. Icon only by default. The parent can stretch it and show its text
 * label (for a stacked mobile form) by setting two custom properties:
 * `--voice-mic-width: 100%` and `--voice-mic-label: inline`. */
@Component({
  selector: 'app-voice-mic-button',
  styleUrl: './voice-mic-button.css',
  templateUrl: './voice-mic-button.html',
})
export class VoiceMicButton {
  voice = inject(VoiceStateService);
}
