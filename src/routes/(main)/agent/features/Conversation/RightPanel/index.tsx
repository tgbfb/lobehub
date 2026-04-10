import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import RightPanel from '@/features/RightPanel';

import ResourcesSection from './ResourcesSection';

interface AgentWorkspaceRightPanelProps {
  onSelectDocument: (id: string | null) => void;
  selectedDocumentId: string | null;
}

const AgentWorkspaceRightPanel = memo<AgentWorkspaceRightPanelProps>(
  ({ onSelectDocument, selectedDocumentId }) => {
    // const toggleRightPanel = useGlobalStore((s) => s.toggleRightPanel);

    return (
      <RightPanel defaultWidth={360} maxWidth={520} minWidth={300}>
        <Flexbox height={'100%'} width={'100%'}>
          {/* <NavHeader
            showTogglePanelButton={false}
            style={{ paddingBlock: 8, paddingInline: 8 }}
            right={
              <ActionIcon
                icon={PanelRightCloseIcon}
                size={DESKTOP_HEADER_ICON_SIZE}
                onClick={() => toggleRightPanel(false)}
              />
            }
          /> */}
          <Flexbox gap={8} height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
            {/* <AgentSummary /> */}
            {/* <ProgressSection /> */}
            <ResourcesSection
              selectedDocumentId={selectedDocumentId}
              onSelectDocument={onSelectDocument}
            />
          </Flexbox>
        </Flexbox>
      </RightPanel>
    );
  },
);

export default AgentWorkspaceRightPanel;
