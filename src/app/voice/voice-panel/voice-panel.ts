import { Component, ElementRef, afterRenderEffect, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { VoiceMode, VoiceStateService } from '../voice-state.service';

const STATUS_LABELS: Record<VoiceMode, string> = {
  idle: 'Ready',
  listening: 'Listening',
  speaking: 'Speaking',
  confirm: 'Confirm',
};

/** The assistant panel: a short chat where the user can speak or type. The
 * parent decides when to render it and where it sits. */
@Component({
  selector: 'app-voice-panel',
  styleUrl: './voice-panel.css',
  templateUrl: './voice-panel.html',
  host: {
    '[class.sheet]': 'sheet()',
    '(document:keydown.escape)': 'voice.closePanel()',
  },
})
export class VoicePanel {
  voice = inject(VoiceStateService);

  /** Whether the panel turns into a bottom sheet on narrow screens. */
  sheet = input(true);

  statusLabel = computed(() => STATUS_LABELS[this.voice.mode()]);

  /** Quick replies and action buttons only show under the newest message
   * from the assistant. */
  latestBotId = computed(() => this.voice.messages().filter((message) => message.from === 'bot').at(-1)?.id);

  /** What is typed in the input bar. */
  text = signal('');
  canSend = computed(() => this.text().trim().length > 0);

  private list = viewChild.required<ElementRef<HTMLElement>>('list');
  private field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // Keep the newest message in view.
    afterRenderEffect(() => {
      this.voice.messages();
      const list = this.list().nativeElement;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      list.scrollTo?.({ top: list.scrollHeight, behavior: reducedMotion ? 'instant' : 'smooth' });
    });

    // Typing is the way in while the conversation is in text mode.
    effect(() => {
      if (this.voice.inputMode() === 'text') {
        this.field().nativeElement.focus({ preventScroll: true });
      }
    });
  }

  send(event: Event): void {
    event.preventDefault();
    if (!this.canSend()) {
      return;
    }
    this.voice.sendText(this.text());
    this.text.set('');
  }
}
