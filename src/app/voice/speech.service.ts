import { Injectable } from '@angular/core';

/** Kenyan English, for both hearing and speaking. */
const SPEECH_LANG = 'en-KE';

/** Why listening stopped without an answer. */
export type ListenProblem = 'blocked' | 'no-mic' | 'network' | 'silence';

export interface ListenHandlers {
  /** What has been heard so far. May still change. */
  onDraft(text: string): void;
  /** The finished sentence. */
  onFinal(text: string): void;
  /** Listening ended with nothing to answer. */
  onProblem(problem: ListenProblem): void;
}

/* The parts of the browser's speech recognition this app uses. Typed here
   because not every TypeScript DOM library ships them. */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

function recognitionClass(): (new () => Recognition) | undefined {
  const scope = globalThis as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Whether this browser can turn speech into text. */
export function speechRecognitionSupported(): boolean {
  return !!recognitionClass();
}

const PROBLEMS: Record<string, ListenProblem> = {
  'not-allowed': 'blocked',
  'service-not-allowed': 'blocked',
  'audio-capture': 'no-mic',
  network: 'network',
};

/** The browser's speech recognition and speech synthesis, behind two small
 * calls: listen for one sentence, and say one sentence. */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private recognition?: Recognition;
  private stopSpeaking?: () => void;

  /** Listens for one sentence. Starting again drops the one before. */
  listen(handlers: ListenHandlers): void {
    this.stopListening();
    const RecognitionClass = recognitionClass();
    if (!RecognitionClass) {
      handlers.onProblem('no-mic');
      return;
    }

    const recognition = new RecognitionClass();
    recognition.lang = SPEECH_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;

    let done = false;
    let problem: ListenProblem = 'silence';
    // A stopped session must stay quiet, so every callback checks it is
    // still the current one.
    const current = () => this.recognition === recognition;

    recognition.onresult = (event) => {
      if (!current() || done) {
        return;
      }
      const results = Array.from(event.results);
      const text = results
        .map((result) => result[0].transcript)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) {
        return;
      }
      if (results.at(-1)?.isFinal) {
        done = true;
        this.recognition = undefined;
        handlers.onFinal(text);
      } else {
        handlers.onDraft(text);
      }
    };
    recognition.onerror = (event) => {
      problem = PROBLEMS[event.error] ?? problem;
    };
    recognition.onend = () => {
      if (!current()) {
        return;
      }
      this.recognition = undefined;
      if (!done) {
        handlers.onProblem(problem);
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.recognition = undefined;
      handlers.onProblem('no-mic');
    }
  }

  /** True while the mic is open and waiting for a sentence. */
  get listening(): boolean {
    return !!this.recognition;
  }

  stopListening(): void {
    const recognition = this.recognition;
    this.recognition = undefined;
    recognition?.abort();
  }

  /** Says the text out loud. Resolves when it has finished, was cut off, or
   * the browser can't speak. */
  speak(text: string): Promise<void> {
    this.stopSpeech();
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG;

      // Some browsers never report the end of speech, so don't wait forever.
      const giveUp = setTimeout(() => finish(), 4000 + text.length * 90);
      const finish = () => {
        clearTimeout(giveUp);
        if (this.stopSpeaking === finish) {
          this.stopSpeaking = undefined;
        }
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      this.stopSpeaking = finish;
      synth.speak(utterance);
    });
  }

  stopSpeech(): void {
    globalThis.speechSynthesis?.cancel();
    this.stopSpeaking?.();
  }
}
