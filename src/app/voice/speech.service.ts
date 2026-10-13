import { Injectable } from '@angular/core';

/** Kenyan English, for both hearing and speaking. */
const SPEECH_LANG = 'en-KE';

/** Voices to speak with, best first. Few browsers have a Kenyan voice, and
 * asking for a language with no voice can leave the browser silent, so the
 * voice is always picked from what the browser really has. */
const VOICE_LANGS = ['en-ke', 'en-gb', 'en-za', 'en-ng', 'en-in', 'en-au', 'en-us', 'en'];

/** A patient listen ends after this long with nothing new heard. Long
 * enough for the pauses people leave between groups of digits. */
const PATIENT_SILENCE_MS = 2200;

/** How long speech may take to start before it is taken as not coming. */
const SPEECH_START_MS = 2500;

/** Why listening stopped without an answer. */
export type ListenProblem = 'blocked' | 'no-mic' | 'network' | 'silence';

export interface ListenOptions {
  /** Keeps listening through short pauses, for answers said in pieces such
   * as an ID or phone number. Without it the browser ends the answer at the
   * first pause, which suits a short reply. */
  patient?: boolean;
}

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

/** Joins the pieces heard so far into one line. Some phones repeat the
 * whole answer in every piece rather than only the new words, so a piece
 * that restates what is already there replaces it. */
export function heardText(pieces: string[]): string {
  let text = '';
  for (const piece of pieces) {
    const next = piece.replace(/\s+/g, ' ').trim();
    if (!next) {
      continue;
    }
    text = text && !next.toLowerCase().startsWith(text.toLowerCase()) ? `${text} ${next}` : next;
  }
  return text;
}

/** The best voice the browser has for these replies, if it has any. */
export function pickVoice<T extends { lang: string; default?: boolean }>(voices: T[]): T | undefined {
  const lang = (voice: T) => voice.lang.toLowerCase().replace('_', '-');
  for (const wanted of VOICE_LANGS) {
    const match = voices.find((voice) => lang(voice) === wanted) ?? voices.find((voice) => lang(voice).startsWith(`${wanted}-`));
    if (match) {
      return match;
    }
  }
  return voices.find((voice) => voice.default) ?? voices[0];
}

/** The browser's speech recognition and speech synthesis, behind two small
 * calls: listen for one sentence, and say one sentence. */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private recognition?: Recognition;
  private stopSpeaking?: () => void;
  private patienceTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Some browsers only load their voices once asked, so ask early.
    globalThis.speechSynthesis?.getVoices?.();
  }

  /** Listens for one answer. Starting again drops the one before. */
  listen(handlers: ListenHandlers, options: ListenOptions = {}): void {
    this.stopListening();
    const RecognitionClass = recognitionClass();
    if (!RecognitionClass) {
      handlers.onProblem('no-mic');
      return;
    }

    const recognition = new RecognitionClass();
    recognition.lang = SPEECH_LANG;
    recognition.interimResults = true;
    recognition.continuous = !!options.patient;

    let done = false;
    let problem: ListenProblem = 'silence';
    // A stopped session must stay quiet, so every callback checks it is
    // still the current one.
    const current = () => this.recognition === recognition;

    /** What a patient listen has heard so far. */
    let heard = '';
    const finish = (text: string) => {
      done = true;
      clearTimeout(this.patienceTimer);
      this.recognition = undefined;
      recognition.abort();
      handlers.onFinal(text);
    };

    recognition.onresult = (event) => {
      if (!current() || done) {
        return;
      }
      const results = Array.from(event.results);
      const text = heardText(results.map((result) => result[0].transcript));
      if (!text) {
        return;
      }
      if (options.patient) {
        // The answer is over when nothing new has been heard for a while,
        // not at the first pause.
        heard = text;
        handlers.onDraft(text);
        clearTimeout(this.patienceTimer);
        this.patienceTimer = setTimeout(() => current() && !done && finish(text), PATIENT_SILENCE_MS);
      } else if (results.at(-1)?.isFinal) {
        finish(text);
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
      if (!done && heard) {
        // The browser stopped by itself before the pause ran out.
        finish(heard);
        return;
      }
      clearTimeout(this.patienceTimer);
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
    clearTimeout(this.patienceTimer);
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
      const voice = pickVoice(synth.getVoices?.() ?? []);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      // Speech that never starts (no voice, or sound blocked) is not waited
      // for. Once it has started, some browsers never report the end, so
      // that wait has a limit too.
      let giveUp = setTimeout(() => finish(), SPEECH_START_MS);
      const finish = () => {
        clearTimeout(giveUp);
        if (this.stopSpeaking === finish) {
          this.stopSpeaking = undefined;
        }
        resolve();
      };
      utterance.onstart = () => {
        clearTimeout(giveUp);
        giveUp = setTimeout(() => finish(), 3000 + text.length * 90);
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
