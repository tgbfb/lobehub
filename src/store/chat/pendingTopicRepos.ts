/**
 * Stub implementation for open-source builds.
 *
 * The cloud repo overrides this file at src/store/chat/pendingTopicRepos.ts
 * with a real module-level singleton that buffers per-agent repo selections
 * made before the first message (no topic yet), so gateway.ts can write them
 * into the topic metadata at creation time.
 *
 * In open-source / desktop builds this stub is used: all functions are no-ops
 * and consumePendingTopicRepos always returns [] (desktop CC uses workingDirectory
 * instead of repos, so this path is never exercised).
 */

export const setPendingTopicRepos = (_agentId: string, _repos: string[]): void => {};

export const consumePendingTopicRepos = (_agentId: string): string[] => [];

export const getPendingTopicRepos = (_agentId: string): string[] => [];
