import type { OpenAIChatMessage } from '@lobechat/types';

/**
 * Bump when editing the autocomplete system prompt or schema below. Plumbed
 * through `metadata.promptVersion` at the call site so per-call tracing
 * groups runs by prompt iteration. The 6-char prompt hash on the row catches
 * forgotten bumps.
 */
export const INPUT_COMPLETION_PROMPT_VERSION = 'v1.2';

/**
 * Symbolic schema name — also recorded on the tracing row's `schemaName`
 * column so prompt iterations and schema renames can be reasoned about
 * together.
 */
export const INPUT_COMPLETION_SCHEMA_NAME = 'InputCompletion';

/**
 * Minimal `generateObject` schema: a single `completion` string. The JSON
 * wrapping overhead is ~15-30 tokens, which is negligible against the model's
 * ~100-token completion budget but unlocks per-call tracing via the existing
 * `ModelRuntime.generateObject` hook.
 */
export interface InputCompletionSchema {
  name: typeof INPUT_COMPLETION_SCHEMA_NAME;
  schema: {
    additionalProperties: false;
    properties: {
      completion: { description: string; type: 'string' };
    };
    required: ['completion'];
    type: 'object';
  };
  strict: true;
}

const INPUT_COMPLETION_SCHEMA: InputCompletionSchema = {
  name: INPUT_COMPLETION_SCHEMA_NAME,
  schema: {
    additionalProperties: false,
    properties: {
      completion: {
        description:
          "The continuation of the user's draft, inserted verbatim at the cursor and written in the user's own voice. May be a phrase, the rest of the sentence, or the next sentence or two when the conversation makes the intent clear. Empty string when the only natural continuation would be the assistant's voice or would require fabricating specifics the user hasn't signalled.",
        type: 'string',
      },
    },
    required: ['completion'],
    type: 'object',
  },
  strict: true,
};

const SYSTEM_PROMPT = `You are an inline autocomplete engine for a chat input box. The user is drafting a message to an AI assistant, and you continue that draft from the cursor. Predict what THIS user is about to type next and return it in the JSON object's \`completion\` field; the text is inserted verbatim at the cursor.

Your job is to save the user keystrokes by predicting their intent — the way inline code completion finishes a line you were already writing. Read the conversation so far, infer where the user is heading, and continue their draft naturally.

HOW MUCH TO WRITE
- Complete as much as you can confidently predict: the rest of the current word or phrase, the rest of the sentence, or — when the conversation makes the intent clear — the next sentence or two the user would plausibly type. Favor a genuinely useful continuation over a timid one-word guess.
- Stop as soon as you would be guessing at specifics you don't actually know. Do not write a whole paragraph, and do not author the user's entire message from a blank start.

STAY IN THE USER'S VOICE (the one hard rule)
- You are always FINISHING the user's message, in the user's own voice and language. You are never the assistant; you never answer, agree with, or acknowledge the user.
- If the most natural continuation would be the assistant speaking (answering the question, offering help), then there is nothing left for the user to type — return an empty string.

RETURN AN EMPTY STRING WHEN
- The only natural continuation is the assistant's voice (see above).
- Continuing would require inventing a specific value the user hasn't signalled — a particular file path, name, number, or decision. Stop before the unknown specifics rather than fabricating them.
- The conversation gives no real signal and you would only be padding with filler.

Match the user's language, tone, and register. Output only the text to insert — no quotes, labels, or the cursor marker.

EXAMPLES (→ is the completion; it picks up exactly at the cursor. Shown in English, but always match the user's language.)
- Finish the sentence — draft "How do I cut the cold-start time" → " of my serverless function?"
- Continue the user's stated plan — draft "Let's go with option 2, and " → "add a migration that backfills the new column for existing rows"
- Long-range, conversation supports it — after the assistant proposed a fix, draft "Looks good. " → "Apply it, then run the test suite and show me what still fails."
- Don't fabricate unknown specifics — draft "Deploy it to " → "" (the target environment is a value only the user knows)
- Don't slip into the assistant's voice — draft "Sure, I can " → "" (this reads as the assistant talking, not the user)`;

export interface InputCompletionChainResult {
  messages: OpenAIChatMessage[];
  schema: InputCompletionSchema;
}

/** Marks the caret position inside the <draft> block. Distinctive enough that it
 *  won't collide with anything a user types; the prompt tells the model to drop it. */
const CURSOR_MARKER = '<|cursor|>';

/** Keep only the most recent turns — the tail is what the user is actually
 *  replying to, and a long history both inflates latency/cost and drowns the draft. */
const MAX_CONTEXT_MESSAGES = 8;
/** Cap each turn so one long message can't crowd out the rest (and the draft). */
const MAX_MESSAGE_CHARS = 1000;

const clip = (text: string): string =>
  text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) + '…' : text;

/**
 * Render conversation history as a flat, speaker-labelled reference block — NOT
 * as real `assistant`/`user` role turns. Replaying prior turns in their native
 * roles invites the model to "continue the conversation" as the assistant, which
 * is exactly the role-flip failure we're guarding against. A labelled block keeps
 * the model's only generation target the draft at the end.
 */
const renderContext = (context: OpenAIChatMessage[]): string => {
  const lines = context
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${clip(m.content as string)}`);
  return lines.join('\n');
};

export const chainInputCompletion = (
  beforeCursor: string,
  afterCursor: string,
  context?: OpenAIChatMessage[],
): InputCompletionChainResult => {
  // Everything dynamic lives in the user message; the system prompt stays
  // constant so the tracing `promptHash` keeps grouping runs by prompt version
  // instead of fragmenting per keystroke.
  const draftBlock = `The user is typing a new message to the assistant. Continue their draft from the ${CURSOR_MARKER} marker, in the user's own voice:\n<draft>\n${beforeCursor}${CURSOR_MARKER}${afterCursor}\n</draft>`;

  const rendered = context?.length ? renderContext(context) : '';
  const userContent = rendered
    ? `<conversation>\n${rendered}\n</conversation>\n\n${draftBlock}`
    : draftBlock;

  return {
    messages: [
      { content: SYSTEM_PROMPT, role: 'system' },
      { content: userContent, role: 'user' },
    ],
    schema: INPUT_COMPLETION_SCHEMA,
  };
};
