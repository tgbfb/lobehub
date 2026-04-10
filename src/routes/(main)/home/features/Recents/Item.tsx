import { ActionIcon, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import {
  CheckSquareIcon,
  FileIcon,
  FileTextIcon,
  HashIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import InlineRename from '@/components/InlineRename';
import NavItem from '@/features/NavPanel/components/NavItem';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { usePrefetchResource } from '@/hooks/usePrefetchResource';
import { getPlatformIcon } from '@/routes/(main)/agent/channel/const';
import { type RecentItem } from '@/server/routers/lambda/recent';

import { useRecentItemDropdownMenu } from './useDropdownMenu';

const TYPE_ICON_MAP = {
  document: FileTextIcon,
  file: FileIcon,
  task: CheckSquareIcon,
  topic: HashIcon,
};

const RecentListItem = memo<RecentItem>((item) => {
  const { title, type, agentId, id, metadata } = item;
  const IconComponent = TYPE_ICON_MAP[type] || FileIcon;
  const [editing, setEditing] = useState(false);
  const prefetchAgent = usePrefetchAgent();
  const prefetchResource = usePrefetchResource();

  const toggleEditing = useCallback((visible?: boolean) => {
    setEditing(!!visible);
  }, []);

  const handleMouseEnter = useCallback(() => {
    switch (type) {
      case 'topic':
      case 'task': {
        if (agentId) prefetchAgent(agentId);
        break;
      }
      case 'document':
      case 'file': {
        prefetchResource(id);
        break;
      }
    }
  }, [type, agentId, id, prefetchAgent, prefetchResource]);

  const { dropdownMenu, handleRename } = useRecentItemDropdownMenu(item, toggleEditing);

  return (
    <Flexbox style={{ position: 'relative' }}>
      <NavItem
        contextMenuItems={dropdownMenu}
        disabled={editing}
        title={title}
        actions={
          <DropdownMenu items={dropdownMenu()} nativeButton={false}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
          </DropdownMenu>
        }
        icon={(() => {
          if (type === 'topic' && metadata?.bot?.platform) {
            const ProviderIcon = getPlatformIcon(metadata.bot.platform);
            if (ProviderIcon) {
              return <ProviderIcon color={cssVar.colorTextDescription} size={16} />;
            }
          }
          return (
            <Icon
              icon={IconComponent}
              size={'small'}
              style={{ color: cssVar.colorTextDescription }}
            />
          );
        })()}
        onMouseEnter={handleMouseEnter}
      />
      <InlineRename
        open={editing}
        title={title}
        onOpenChange={(open) => toggleEditing(open)}
        onSave={handleRename}
      />
    </Flexbox>
  );
});

export default RecentListItem;
