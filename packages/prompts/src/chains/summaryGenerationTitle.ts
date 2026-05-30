import type { ChatStreamPayload } from '@lobechat/types';

export const chainSummaryGenerationTitle = (
  prompts: string[],
  modal: 'image' | 'video',
  locale: string,
): Partial<ChatStreamPayload> => {
  // Format multiple prompts for better readability
  const formattedPrompts = prompts.map((prompt, index) => `${index + 1}. ${prompt}`).join('\n');

  return {
    messages: [
      {
        content: `You are an expert AI art creator and language specialist. Based on the AI ${modal} prompt provided by the user, generate a concise title that captures the core creative concept. The title will be used to identify and manage this series of works. Limit to 10 characters or fewer, no punctuation, output language: ${locale}.`,
        role: 'system',
      },
      {
        content: `Prompts:\n${formattedPrompts}`,
        role: 'user',
      },
    ],
  };
};
