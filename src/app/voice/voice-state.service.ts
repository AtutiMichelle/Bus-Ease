import { Injectable, computed, signal } from '@angular/core';

export type VoiceMode = 'idle' | 'listening' | 'speaking' | 'confirm';

/** How the user gave their last answer. Later the app will only speak back
 * when the user spoke. */
export type VoiceInputMode = 'voice' | 'text';

/** Search fields a voice turn can fill. */
export type VoiceField = 'origin' | 'destination' | 'date';

export interface VoiceAction {
  label: string;
  primary: boolean;
}

export interface VoiceMessage {
  id: number;
  from: 'bot' | 'user';
  text: string;
  /** True while the user is still talking and the text may still change. */
  draft?: boolean;
  /** Quick replies the user can say or tap. */
  chips?: string[];
  actions?: VoiceAction[];
}

export interface VoiceState {
  mode: VoiceMode;
  open: boolean;
  /** The conversation for the current page only. */
  messages: VoiceMessage[];
  inputMode: VoiceInputMode;
  /** Search fields to mark as filled by voice. */
  filledFields: VoiceField[];
  /** Text to show in a search field. Only the demo sets this for now. */
  fieldText: Partial<Record<VoiceField, string>>;
  /** Number of the result card picked by voice (1-based), if any. */
  selectedCard: number | null;
}

/** What the assistant says when the panel opens before anything was said. */
const GREETING = 'How can I help with your booking?';

export const EMPTY_VOICE_STATE: VoiceState = {
  mode: 'idle',
  open: false,
  messages: [],
  inputMode: 'voice',
  filledFields: [],
  fieldText: {},
  selectedCard: null,
};

/** State for the voice booking UI. Holds what to show only: there is no
 * speech recognition, speech synthesis or parsing behind it yet. */
@Injectable({ providedIn: 'root' })
export class VoiceStateService {
  private state = signal<VoiceState>(EMPTY_VOICE_STATE);
  private lastId = 0;

  mode = computed(() => this.state().mode);
  open = computed(() => this.state().open);
  messages = computed(() => this.state().messages);
  inputMode = computed(() => this.state().inputMode);
  filledFields = computed(() => this.state().filledFields);
  fieldText = computed(() => this.state().fieldText);
  selectedCard = computed(() => this.state().selectedCard);

  /** Whether this browser can do voice at all. Hardcoded until the real
   * speech check exists. */
  supported = signal(true);

  /** True while the mic is live, used by the mic buttons for their red look. */
  listening = computed(() => this.open() && this.mode() === 'listening');

  openPanel(): void {
    this.setState({ open: true, mode: 'listening', inputMode: 'voice', messages: this.messagesOrGreeting() });
  }

  /** Closing ends the conversation, so the next open starts fresh. */
  closePanel(): void {
    this.state.set(EMPTY_VOICE_STATE);
  }

  togglePanel(): void {
    if (this.open()) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  /** Turns the mic on or off without closing the panel. */
  toggleListening(): void {
    if (this.mode() === 'listening') {
      this.setState({ mode: 'idle' });
    } else {
      this.setState({ mode: 'listening', inputMode: 'voice' });
    }
  }

  /** Adds what the user typed to the conversation. Nothing answers it yet. */
  sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    this.setState({
      mode: 'idle',
      inputMode: 'text',
      messages: [...this.messages(), { id: this.nextId(), from: 'user', text: trimmed }],
    });
  }

  /** Each page is its own step: moving to another page drops the messages
   * from the one before. */
  clearMessages(): void {
    this.setState({ messages: this.open() ? [this.greeting()] : [] });
  }

  setState(partial: Partial<VoiceState>): void {
    this.state.update((state) => ({ ...state, ...partial }));
  }

  /** A message id that no other message in this session has. */
  nextId(): number {
    return ++this.lastId;
  }

  private greeting(): VoiceMessage {
    return { id: this.nextId(), from: 'bot', text: GREETING };
  }

  private messagesOrGreeting(): VoiceMessage[] {
    return this.messages().length > 0 ? this.messages() : [this.greeting()];
  }
}
