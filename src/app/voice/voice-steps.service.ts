import { Injectable, computed, signal } from '@angular/core';
import { VoiceAction } from './voice-state.service';

/** Something the assistant says. */
export interface VoiceReply {
  text: string;
  /** What to read aloud when it should differ from the text, such as a
   * phone number read digit by digit. */
  say?: string;
  chips?: string[];
  actions?: VoiceAction[];
  /** The reply asks the user to confirm something. */
  confirm?: boolean;
  /** False when no answer is expected, so the mic stays off afterwards. */
  listen?: boolean;
  /** True when the assistant is leaving the page to the user, so the panel
   * closes once the reply has been read and is out of the way of the form. */
  handover?: boolean;
}

/** The quick replies and buttons that go under a reply. */
export type VoicePrompts = Pick<VoiceReply, 'chips' | 'actions' | 'confirm'>;

/** What running a tool for the AI model gave back. Everything except
 * `leaving` and `reply` is handed to the model as the tool's answer. */
export interface VoiceToolResult {
  [key: string]: unknown;
  /** True when the tool moved to another page, which ends this answer. */
  leaving?: boolean;
  /** Something to say on the way out, since the model gets no more turns. */
  reply?: VoiceReply;
}

/** What a step gives the AI model, on pages where the model may lead the
 * conversation. The model only ever reads `context` and asks for tools:
 * the step checks every choice against the page before acting on it. */
export interface VoiceStepModel {
  /** The name the assistant function knows this step by. */
  name: 'buses' | 'seats';
  /** What is on the page right now, for the model to read. */
  context(): Record<string, unknown>;
  runTool(name: string, args: Record<string, unknown>): Promise<VoiceToolResult>;
  /** The quick replies and buttons that fit the page as it now stands. */
  prompts(): VoicePrompts;
}

/** One booking page's side of the conversation: picking a bus, picking
 * seats, passenger details, payment or the ticket. The page creates its
 * step and hands it the few things the step may read and do there. */
export interface VoiceStep {
  /** False while the page is still loading what the step talks about. */
  ready(): boolean;
  /** Changes when the page moves on by itself (a payment going through,
   * say), so the assistant speaks again without being asked. */
  stage?(): string;
  /** What to say on arriving at this step, or when its stage changes.
   * Null to say nothing. */
  intro(): VoiceReply | null;
  /** Answers what the user said by fixed rules, with no waiting. Undefined
   * when the rules do not understand it. Null when the page is about to
   * change and the next thing said will come from that. */
  answer(text: string): Promise<VoiceReply | null | undefined>;
  /** What to say when nothing understood the user. */
  unsure(): VoiceReply;
  /** True when the next answer is likely to be said in pieces, such as an
   * ID number, so the mic should wait through short pauses. */
  patient?(): boolean;
  /** Set on steps the AI model may lead. Steps without it are answered by
   * their rules alone, and nothing said there is sent to the model. */
  model?: VoiceStepModel;
  /** Forgets anything half-agreed, for when the conversation ends. */
  reset(): void;
}

/** Which booking step the assistant is on. Pages put their step here while
 * they are on screen. The newest one is live, so the seat panel takes over
 * from the results page behind it. */
@Injectable({ providedIn: 'root' })
export class VoiceStepsService {
  private steps = signal<VoiceStep[]>([]);

  readonly active = computed<VoiceStep | null>(() => this.steps().at(-1) ?? null);

  /** Makes the step live. Call the returned function when the page goes. */
  enter(step: VoiceStep): () => void {
    this.steps.update((steps) => [...steps, step]);
    return () => {
      step.reset();
      this.steps.update((steps) => steps.filter((entry) => entry !== step));
    };
  }
}
