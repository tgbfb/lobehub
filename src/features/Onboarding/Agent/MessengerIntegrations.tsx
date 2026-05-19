'use client';

import { Block, Flexbox, Icon, Skeleton, Tag, Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { CheckCircle2Icon, ChevronRightIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { type MessengerPlatform, PlatformAvatar } from '@/features/Messenger/constants';
import LinkModal from '@/features/Messenger/LinkModal';
import { messengerService } from '@/services/messenger';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    cursor: pointer;

    padding-block: 12px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadius};

    transition: border-color 0.2s ease;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorderHover};
    }
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: 100%;

    @media (width <= 540px) {
      grid-template-columns: 1fr;
    }
  `,
  header: css`
    text-align: center;
  `,
}));

interface SelectedPlatform {
  appId?: string;
  botUsername?: string;
  name: string;
  platform: MessengerPlatform;
}

const MessengerIntegrations = memo(() => {
  const { t } = useTranslation('onboarding');
  const [selected, setSelected] = useState<SelectedPlatform | null>(null);

  const platformsSWR = useSWR('messenger:availablePlatforms', () =>
    messengerService.availablePlatforms(),
  );
  // Only fetch existing connections when at least one platform exists — keeps
  // the network footprint zero for self-hosted deployments without messenger.
  const linksSWR = useSWR(
    platformsSWR.data && platformsSWR.data.length > 0 ? 'messenger:listMyLinks' : null,
    () => messengerService.listMyLinks(),
  );
  const installationsSWR = useSWR(
    platformsSWR.data && platformsSWR.data.length > 0 ? 'messenger:listMyInstallations' : null,
    () => messengerService.listMyInstallations(),
  );

  const connectedPlatforms = useMemo(() => {
    const set = new Set<MessengerPlatform>();
    for (const link of linksSWR.data ?? []) set.add(link.platform as MessengerPlatform);
    for (const inst of installationsSWR.data ?? []) set.add(inst.platform as MessengerPlatform);
    return set;
  }, [installationsSWR.data, linksSWR.data]);

  if (platformsSWR.isLoading) {
    return (
      <Flexbox gap={12} width={'100%'}>
        <Skeleton.Button active style={{ height: 18, width: 160 }} />
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton.Button active key={i} style={{ height: 64, width: '100%' }} />
          ))}
        </div>
      </Flexbox>
    );
  }

  const platforms = platformsSWR.data ?? [];
  if (platforms.length === 0) return null;

  return (
    <Flexbox align={'center'} gap={12} width={'100%'}>
      <Flexbox align={'center'} className={styles.header} gap={2}>
        <Text strong style={{ fontSize: 15 }}>
          {t('agent.messenger.title')}
        </Text>
        <Text style={{ fontSize: 13 }} type={'secondary'}>
          {t('agent.messenger.subtitle')}
        </Text>
      </Flexbox>
      <div className={styles.grid}>
        {platforms.map((platform) => {
          const isConnected = connectedPlatforms.has(platform.id);
          return (
            <Block
              className={styles.card}
              key={platform.id}
              onClick={() =>
                setSelected({
                  appId: platform.appId,
                  botUsername: platform.botUsername,
                  name: platform.name,
                  platform: platform.id,
                })
              }
            >
              <Flexbox horizontal align={'center'} gap={12}>
                <PlatformAvatar platform={platform.id} size={36} />
                <Flexbox flex={1} gap={2}>
                  <Text strong style={{ fontSize: 14 }}>
                    {platform.name}
                  </Text>
                  {isConnected ? (
                    <Tag color={'success'} icon={<Icon icon={CheckCircle2Icon} size={'small'} />}>
                      {t('agent.messenger.connected')}
                    </Tag>
                  ) : (
                    <Text style={{ fontSize: 12 }} type={'secondary'}>
                      {t('agent.messenger.connect')}
                    </Text>
                  )}
                </Flexbox>
                <Icon icon={ChevronRightIcon} />
              </Flexbox>
            </Block>
          );
        })}
      </div>
      <LinkModal
        appId={selected?.appId}
        botUsername={selected?.botUsername}
        name={selected?.name ?? ''}
        open={!!selected}
        platform={selected?.platform ?? 'telegram'}
        onClose={() => setSelected(null)}
      />
    </Flexbox>
  );
});

MessengerIntegrations.displayName = 'OnboardingMessengerIntegrations';

export default MessengerIntegrations;
