'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import { useClientDataSWR } from '@/libs/swr';
import { recentService } from '@/services/recent';

import RecentListItem from './Item';

interface AllRecentsDrawerProps {
  onClose: () => void;
  open: boolean;
}

const AllRecentsDrawer = memo<AllRecentsDrawerProps>(({ open, onClose }) => {
  const { t } = useTranslation('common');

  const { data: recents, isLoading } = useClientDataSWR(open ? ['allRecents', open] : null, () =>
    recentService.getAll(50),
  );

  return (
    <SideBarDrawer open={open} title={t('recents')} onClose={onClose}>
      <Flexbox gap={1} paddingBlock={1} paddingInline={4}>
        {isLoading || !recents ? (
          <SkeletonList rows={5} />
        ) : (
          recents.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
              to={item.routePath}
            >
              <RecentListItem {...item} />
            </Link>
          ))
        )}
      </Flexbox>
    </SideBarDrawer>
  );
});

AllRecentsDrawer.displayName = 'AllRecentsDrawer';

export default AllRecentsDrawer;
