import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useElectronStore } from '@/store/electron';

/**
 * Returns only user-selected working directories. Unlike useEffectiveWorkingDirectory,
 * this intentionally excludes desktop Home/Desktop fallbacks so upload behavior
 * does not change before the user binds the conversation to a directory.
 */
export const useExplicitWorkingDirectory = (agentId?: string): string | undefined => {
  const agencyConfig = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgencyConfigById(agentId)(s) : undefined,
  );
  const legacyAgentWorkingDirectory = useAgentStore((s) =>
    agentId ? s.localAgentWorkingDirectoryMap?.[agentId] : undefined,
  );
  const topicWorkingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId);
  const agentWorkingDirectory = targetDeviceId
    ? agencyConfig?.workingDirByDevice?.[targetDeviceId]
    : undefined;

  return topicWorkingDirectory || agentWorkingDirectory || legacyAgentWorkingDirectory;
};
