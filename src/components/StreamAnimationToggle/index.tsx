'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo, useEffect, useState } from 'react';

export const STREAM_ANIM_DISABLED_CLASS = 'lobe-no-stream-anim';
const STORAGE_KEY = 'lobe_stream_anim_disabled';

const readInitial = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const applyClass = (disabled: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(STREAM_ANIM_DISABLED_CLASS, disabled);
};

if (typeof window !== 'undefined') {
  applyClass(readInitial());
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  dot: css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
  `,
  dotOff: css`
    background: ${cssVar.colorTextQuaternary};
  `,
  dotOn: css`
    background: ${cssVar.colorSuccess};
  `,
  toggle: css`
    pointer-events: auto;
    cursor: pointer;
    user-select: none;

    position: fixed;
    z-index: 9999;
    inset-block-end: 24px;
    inset-inline-end: 24px;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 12px;
    line-height: 1;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowTertiary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

const StreamAnimationToggle = memo(() => {
  const [disabled, setDisabled] = useState<boolean>(readInitial);

  useEffect(() => {
    applyClass(disabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, disabled ? '1' : '0');
    } catch {}
  }, [disabled]);

  return (
    <button
      aria-pressed={!disabled}
      className={styles.toggle}
      title="切换 streaming 动画 (用于 CPU 占用对比)"
      type="button"
      onClick={() => setDisabled((v) => !v)}
    >
      <span className={cx(styles.dot, disabled ? styles.dotOff : styles.dotOn)} />
      <span>动画 {disabled ? '关' : '开'}</span>
    </button>
  );
});

StreamAnimationToggle.displayName = 'StreamAnimationToggle';

export default StreamAnimationToggle;
