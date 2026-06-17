/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InputRow from './InputRow';

vi.mock('@/features/Conversation', () => ({
  ChatInput: ({
    compact,
    leftActions,
    rightActions,
    showControlBar,
  }: {
    compact?: boolean;
    leftActions?: string[];
    rightActions?: string[];
    showControlBar?: boolean;
  }) => (
    <div
      data-compact={String(compact ?? false)}
      data-left-actions={JSON.stringify(leftActions ?? [])}
      data-right-actions={JSON.stringify(rightActions ?? [])}
      data-show-control-bar={String(showControlBar ?? true)}
      data-testid="chat-input"
    />
  ),
}));

vi.mock('@lobehub/ui', () => ({
  Icon: ({ icon }: { icon: () => void }) => <span data-testid="icon">{icon.name}</span>,
}));

describe('FloatingChatPanel InputRow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders ChatInput in compact mode with empty actions and no control bar while collapsed', () => {
    render(<InputRow isCollapsed onExpand={() => {}} />);
    const input = screen.getByTestId('chat-input');
    expect(input.dataset.compact).toBe('true');
    expect(input.dataset.leftActions).toBe('[]');
    expect(input.dataset.rightActions).toBe('[]');
    expect(input.dataset.showControlBar).toBe('false');
  });

  it('renders ChatInput at full size with all actions while expanded', () => {
    render(<InputRow isCollapsed={false} onExpand={() => {}} />);
    const input = screen.getByTestId('chat-input');
    expect(input.dataset.compact).toBe('false');
    expect(input.dataset.leftActions).toBe(JSON.stringify(['typo', 'stt']));
    expect(input.dataset.rightActions).toBe(JSON.stringify(['contextWindow']));
    expect(input.dataset.showControlBar).toBe('true');
  });

  it('shows the hover bar on enter and hides it on leave after a debounce delay', () => {
    render(<InputRow isCollapsed onExpand={() => {}} />);
    const row = screen.getByTestId('floating-chat-panel-input-row');
    const bar = screen.getByTestId('floating-chat-panel-hover-bar');

    expect(bar.getAttribute('aria-hidden')).toBe('true');

    fireEvent.mouseEnter(row);
    expect(bar.getAttribute('aria-hidden')).toBe('false');

    fireEvent.mouseLeave(row);
    expect(bar.getAttribute('aria-hidden')).toBe('false');

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(bar.getAttribute('aria-hidden')).toBe('false');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bar.getAttribute('aria-hidden')).toBe('true');
  });

  it('cancels a pending hide when the cursor re-enters', () => {
    render(<InputRow isCollapsed onExpand={() => {}} />);
    const row = screen.getByTestId('floating-chat-panel-input-row');
    const bar = screen.getByTestId('floating-chat-panel-hover-bar');

    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    fireEvent.mouseEnter(row);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bar.getAttribute('aria-hidden')).toBe('false');
  });

  it('keeps the hover bar hidden in expanded state regardless of hover', () => {
    render(<InputRow isCollapsed={false} onExpand={() => {}} />);
    const row = screen.getByTestId('floating-chat-panel-input-row');
    const bar = screen.getByTestId('floating-chat-panel-hover-bar');

    fireEvent.mouseEnter(row);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
  });

  it('fires onExpand when the hover-bar expand button is clicked', () => {
    const onExpand = vi.fn();
    render(<InputRow isCollapsed onExpand={onExpand} />);
    fireEvent.click(screen.getByTestId('floating-chat-panel-expand-button'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('releases compact rendering while the row holds focus inside the collapsed strip', () => {
    render(
      <div>
        <InputRow isCollapsed onExpand={() => {}} />
        <button data-testid="outside" type="button">
          outside
        </button>
      </div>,
    );
    const input = screen.getByTestId('chat-input');
    expect(input.dataset.compact).toBe('true');

    fireEvent.focus(screen.getByTestId('floating-chat-panel-input-row'));
    expect(input.dataset.compact).toBe('false');
    expect(input.dataset.leftActions).toBe(JSON.stringify(['typo', 'stt']));
    expect(input.dataset.rightActions).toBe(JSON.stringify(['contextWindow']));
    expect(input.dataset.showControlBar).toBe('true');
  });

  it('restores compact rendering once focus leaves the row entirely', () => {
    render(
      <div>
        <InputRow isCollapsed onExpand={() => {}} />
        <button data-testid="outside" type="button">
          outside
        </button>
      </div>,
    );
    const row = screen.getByTestId('floating-chat-panel-input-row');
    fireEvent.focus(row);
    expect(screen.getByTestId('chat-input').dataset.compact).toBe('false');

    fireEvent.blur(row, { relatedTarget: screen.getByTestId('outside') });
    expect(screen.getByTestId('chat-input').dataset.compact).toBe('true');
  });

  it('keeps compact off when focus moves between elements inside the row', () => {
    render(
      <div>
        <InputRow isCollapsed onExpand={() => {}} />
      </div>,
    );
    const row = screen.getByTestId('floating-chat-panel-input-row');
    fireEvent.focus(row);
    expect(screen.getByTestId('chat-input').dataset.compact).toBe('false');

    fireEvent.blur(row, { relatedTarget: screen.getByTestId('chat-input') });
    expect(screen.getByTestId('chat-input').dataset.compact).toBe('false');
  });
});
