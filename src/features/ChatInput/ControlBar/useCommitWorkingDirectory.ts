import type { WorkingDirConfig, WorkingDirEntry } from '@lobechat/types';
import { getWorkingDirEffectivePath } from '@lobechat/types';
import { confirmModal } from '@lobehub/ui/base-ui';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useDeviceStore } from '@/store/device';
import { useElectronStore } from '@/store/electron';

const normalizeWorkingDirEntry = (entry: WorkingDirEntry): WorkingDirEntry | undefined => {
  const path = entry.path.trim();
  if (!path) return undefined;

  const activeWorktree = entry.git?.activeWorktree?.trim();
  const next: WorkingDirEntry = { ...entry, path };

  if (activeWorktree) {
    next.git = { ...entry.git, activeWorktree };
  } else if (next.git) {
    const git = { ...next.git };
    delete git.activeWorktree;
    if (Object.keys(git).length > 0) next.git = git;
    else delete next.git;
  }

  return next;
};

const toAgentWorkingDirConfig = (entry: WorkingDirEntry): WorkingDirConfig => ({
  ...(entry.git ? { git: entry.git } : {}),
  path: entry.path,
  ...(entry.repoType ? { repoType: entry.repoType } : {}),
});

/**
 * Unified working-directory writes, shared by the directory picker for both
 * local and remote runs. Write rules:
 *
 * - **active topic**     → `topic.metadata.workingDirectory` (per-topic override)
 * - **no topic yet**     → `agencyConfig.workingDirByDevice[targetDeviceId]`
 * - **always**           → upsert the target device's `workingDirs` recent list
 *
 * Changing a topic's cwd invalidates its pinned CC session (sessions are keyed
 * per-cwd), so warn before the implicit reset — same as the legacy pickers.
 */
export const useCommitWorkingDirectory = (agentId: string) => {
  const { t } = useTranslation(['plugin', 'chat']);

  const agencyConfig = useAgentStore(agentByIdSelectors.getAgencyConfigById(agentId));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const updateAgentRuntimeEnvConfigById = useAgentStore((s) => s.updateAgentRuntimeEnvConfigById);
  const legacyAgentWorkingDirectory = useAgentStore(
    (s) => s.localAgentWorkingDirectoryMap[agentId],
  );

  const activeTopicId = useChatStore((s) => s.activeTopicId);
  const activeTopic = useChatStore((s) =>
    s.activeTopicId ? topicSelectors.getTopicById(s.activeTopicId)(s) : undefined,
  );
  const updateTopicMetadata = useChatStore((s) => s.updateTopicMetadata);

  const updateDeviceCwd = useDeviceStore((s) => s.updateDeviceCwd);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId);

  const writeCwd = useCallback(
    async (entry?: WorkingDirEntry) => {
      const effectivePath = getWorkingDirEffectivePath(entry);
      // Topic override wins once a conversation exists; otherwise persist the
      // agent's per-device choice so a new topic inherits it.
      if (activeTopicId) {
        await updateTopicMetadata(activeTopicId, { workingDirectory: effectivePath });
      } else {
        if (targetDeviceId) {
          const prev = agencyConfig?.workingDirByDevice ?? {};
          const nextMap = { ...prev };
          if (entry) nextMap[targetDeviceId] = toAgentWorkingDirConfig(entry);
          else delete nextMap[targetDeviceId];
          await updateAgentConfigById(agentId, {
            agencyConfig: { ...agencyConfig, workingDirByDevice: nextMap },
          });
        }
        // Clearing the agent default must also drop the legacy per-agent value —
        // otherwise it keeps re-supplying a stale cwd from a lower precedence
        // level and Clear looks dead. (Only clears the localStorage map; no
        // network round-trip since `workingDirectory` is stripped before send.)
        if (!effectivePath && legacyAgentWorkingDirectory) {
          await updateAgentRuntimeEnvConfigById(agentId, { workingDirectory: undefined });
        }
      }
      // Record on the target device's recent list (not the device-wide default —
      // a per-agent pick shouldn't repoint other agents on the same device).
      if (entry && effectivePath && targetDeviceId) {
        await updateDeviceCwd(targetDeviceId, entry, { setDefault: false });
      }
    },
    [
      agentId,
      agencyConfig,
      activeTopicId,
      targetDeviceId,
      legacyAgentWorkingDirectory,
      updateAgentConfigById,
      updateAgentRuntimeEnvConfigById,
      updateTopicMetadata,
      updateDeviceCwd,
    ],
  );

  /** Pick a directory (with the CC-session-reset guard). */
  const commit = useCallback(
    async (entry: WorkingDirEntry) => {
      const normalizedEntry = normalizeWorkingDirEntry(entry);
      const effectivePath = getWorkingDirEffectivePath(normalizedEntry);
      if (!normalizedEntry || !effectivePath) return;

      const run = () => writeCwd(normalizedEntry);

      const priorSessionId = activeTopic?.metadata?.heteroSessionId;
      const priorCwd = activeTopic?.metadata?.workingDirectory;
      if (priorSessionId && priorCwd && priorCwd !== effectivePath) {
        confirmModal({
          cancelText: t('heteroAgent.switchCwd.cancel', { ns: 'chat' }),
          content: t('heteroAgent.switchCwd.content', { ns: 'chat' }),
          okText: t('heteroAgent.switchCwd.ok', { ns: 'chat' }),
          onOk: run,
          title: t('heteroAgent.switchCwd.title', { ns: 'chat' }),
        });
        return;
      }
      await run();
    },
    [activeTopic, t, writeCwd],
  );

  /**
   * Set the agent's per-device default cwd, ignoring any active topic. Used by
   * the sidebar "new topic in this directory" (+) action, which always targets
   * a fresh topic regardless of what conversation is currently open — so it must
   * write the same high-precedence slot the picker uses for new topics
   * (`workingDirByDevice`), not the legacy per-agent fallback. The new topic
   * bakes this value into its own `metadata.workingDirectory` on first send.
   */
  const commitAgentDefault = useCallback(
    async (newPath: string) => {
      const path = newPath.trim();
      if (!path) return;
      if (targetDeviceId) {
        const prev = agencyConfig?.workingDirByDevice ?? {};
        await updateAgentConfigById(agentId, {
          agencyConfig: {
            ...agencyConfig,
            workingDirByDevice: { ...prev, [targetDeviceId]: path },
          },
        });
      } else {
        // No resolvable device (e.g. gateway id unavailable) — fall back to the
        // legacy per-agent slot so the action still takes effect.
        await updateAgentRuntimeEnvConfigById(agentId, { workingDirectory: path });
      }
    },
    [agentId, agencyConfig, targetDeviceId, updateAgentConfigById, updateAgentRuntimeEnvConfigById],
  );

  /** Clear the current selection (falls back to the next precedence level). */
  const clear = useCallback(async () => {
    const run = () => writeCwd(undefined);

    const priorSessionId = activeTopic?.metadata?.heteroSessionId;
    const priorCwd = activeTopic?.metadata?.workingDirectory;
    if (priorSessionId && priorCwd) {
      confirmModal({
        cancelText: t('heteroAgent.switchCwd.cancel', { ns: 'chat' }),
        content: t('heteroAgent.switchCwd.content', { ns: 'chat' }),
        okText: t('heteroAgent.switchCwd.ok', { ns: 'chat' }),
        onOk: run,
        title: t('heteroAgent.switchCwd.title', { ns: 'chat' }),
      });
      return;
    }
    await run();
  }, [activeTopic, t, writeCwd]);

  return { clear, commit, commitAgentDefault };
};
