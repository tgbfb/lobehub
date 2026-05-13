'use client';

import { Flexbox, SearchBar } from '@lobehub/ui';
import { memo, type Ref, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer, { type SideBarDrawerHandle } from '@/features/NavPanel/SideBarDrawer';
import dynamic from '@/libs/next/dynamic';

const Content = dynamic(() => import('./Content'), {
  loading: () => (
    <Flexbox gap={1} paddingBlock={1} paddingInline={4}>
      <SkeletonList rows={3} />
    </Flexbox>
  ),
  ssr: false,
});

interface AllAgentsDrawerProps {
  ref?: Ref<SideBarDrawerHandle>;
}

const AllAgentsDrawer = memo<AllAgentsDrawerProps>(({ ref }) => {
  const { t } = useTranslation('common');
  const [searchKeyword, setSearchKeyword] = useState('');

  return (
    <SideBarDrawer
      ref={ref}
      title={t('navPanel.agent')}
      subHeader={
        <Flexbox paddingBlock={'0 8px'} paddingInline={8}>
          <SearchBar
            allowClear
            defaultValue={searchKeyword}
            placeholder={t('navPanel.searchAgent')}
            onSearch={(keyword) => setSearchKeyword(keyword)}
            onInputChange={(keyword) => {
              if (!keyword) setSearchKeyword('');
            }}
          />
        </Flexbox>
      }
    >
      <Content searchKeyword={searchKeyword} />
    </SideBarDrawer>
  );
});

AllAgentsDrawer.displayName = 'AllAgentsDrawer';

export default AllAgentsDrawer;
