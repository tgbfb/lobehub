'use client';

import { createStaticStyles } from 'antd-style';
import { XIcon } from 'lucide-react';
import { memo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  tabClose: css`
    cursor: pointer;

    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;

    color: inherit;

    opacity: 0.6;
    background: transparent;

    &:hover {
      opacity: 1;
      background: ${cssVar.colorFillSecondary};
    }
  `,
  tabItem: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;

    max-width: 160px;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    transition:
      color 0.15s,
      background 0.15s;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  tabItemActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillTertiary};
  `,
  tabLabel: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  tabStrip: css`
    scrollbar-width: none;

    overflow-x: auto;
    display: flex;
    flex: 1;
    gap: 4px;
    align-items: center;

    min-width: 0;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
}));

const TabStrip = memo(() => {
  const openLocalFiles = useChatStore(chatPortalSelectors.openLocalFiles);
  const activeLocalFilePath = useChatStore(chatPortalSelectors.activeLocalFilePath);
  const setActiveLocalFile = useChatStore((s) => s.setActiveLocalFile);
  const closeLocalFileTab = useChatStore((s) => s.closeLocalFileTab);

  if (openLocalFiles.length === 0) return null;

  return (
    <div className={styles.tabStrip}>
      {openLocalFiles.map(({ filePath }) => {
        const filename = filePath.split('/').at(-1) ?? filePath;
        const isActive = filePath === activeLocalFilePath;

        return (
          <div
            aria-selected={isActive}
            className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
            key={filePath}
            role="tab"
            tabIndex={0}
            title={filePath}
            onClick={() => setActiveLocalFile(filePath)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLocalFile(filePath);
              }
            }}
          >
            <span className={styles.tabLabel}>{filename}</span>
            <button
              aria-label={`Close ${filename}`}
              className={styles.tabClose}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeLocalFileTab(filePath);
              }}
            >
              <XIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
});

TabStrip.displayName = 'LocalFileTabStrip';

export default TabStrip;
