import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environment';

/** A tool the model wants the app to run. `arguments` is JSON text. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** One entry in the conversation the model sees. */
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** The model's answer: its words, or the tools it wants run first. */
export interface ModelMessage {
  content: string;
  tool_calls?: ToolCall[];
}

/** Which part of the booking the model is helping with. Each has its own
 * instructions and tools on the server. */
export type ModelStep = 'search' | 'buses' | 'seats';

interface AssistantResponse {
  isSuccess?: boolean;
  message?: ModelMessage;
  /** The step the function answered for. An older copy of the function
   * that only knows the search leaves it out. */
  step?: ModelStep;
}

/** Talks to the `assistant` edge function, which holds the AI model's key
 * and instructions (see supabase/functions/assistant). */
@Injectable({ providedIn: 'root' })
export class VoiceModelService {
  private http = inject(HttpClient);
  private url = environment.assistantUrl;

  /** False when no assistant address is set, so only the built-in replies
   * are used. */
  readonly enabled = !!this.url;

  /** Sends the conversation and returns the model's next move. `context`
   * is what is on the page now, for the steps that have a page to read.
   * Throws when the model can't be reached or gives no usable answer. */
  async ask(messages: ChatMessage[], today: string, step: ModelStep = 'search', context?: string): Promise<ModelMessage> {
    const response = await firstValueFrom(this.http.post<AssistantResponse>(this.url, { today, messages, step, context }));
    const message = response?.message;
    if (!response?.isSuccess || !message || (!message.content && !message.tool_calls?.length)) {
      throw new Error('The assistant gave no usable answer');
    }
    if ((response.step ?? 'search') !== step) {
      throw new Error(`The assistant function does not know the ${step} step yet`);
    }
    return message;
  }
}
