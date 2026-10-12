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

interface AssistantResponse {
  isSuccess?: boolean;
  message?: ModelMessage;
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

  /** Sends the conversation and returns the model's next move. Throws when
   * the model can't be reached or gives no usable answer. */
  async ask(messages: ChatMessage[], today: string): Promise<ModelMessage> {
    const response = await firstValueFrom(this.http.post<AssistantResponse>(this.url, { today, messages }));
    const message = response?.message;
    if (!response?.isSuccess || !message || (!message.content && !message.tool_calls?.length)) {
      throw new Error('The assistant gave no usable answer');
    }
    return message;
  }
}
