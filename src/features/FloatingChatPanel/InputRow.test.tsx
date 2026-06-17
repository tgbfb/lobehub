/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InputRow from './InputRow';

vi.mock('@/features/Conversation', () => ({
  ChatInput: ({
    leftActions,
    rightActions,
  }: {
    leftActions?: string[];
    rightActions?: string[];
  }) => (
    <div
      data-left-actions={JSON.stringify(leftActions ?? [])}
      data-right-actions={JSON.stringify(rightActions ?? [])}
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

  it('passes empty action arrays to ChatInput while collapsed', () => {
    render(<InputRow isCollapsed onExpand={() => {}} />);
    const input = screen.getByTestId('chat-input');
    expect(input.dataset.leftActions).toBe('[]');
    expect(input.dataset.rightActions).toBe('[]');
  });

  it('passes the full action arrays to ChatInput while expanded', () => {
    render(<InputRow isCollapsed={false} onExpand={() => {}} />);
    const input = screen.getByTestId('chat-input');
    expect(input.dataset.leftActions).toBe(JSON.stringify(['typo', 'stt']));
    expect(input.dataset.rightActions).toBe(JSON.stringify(['contextWindow']));
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
});
