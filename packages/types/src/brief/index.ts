export interface BriefAction {
  /** Action identifier, e.g. 'approve', 'reject', 'feedback' */
  key: string;
  /** Display label, e.g. "✅ Confirm Start", "💬 Revisions" */
  label: string;
  /**
   * Action type:
   * - 'resolve': directly mark brief as resolved
   * - 'comment': prompt for text input, then resolve
   * - 'link': navigate to a URL (no resolution)
   */
  type: 'resolve' | 'comment' | 'link';
  /** URL for 'link' type actions */
  url?: string;
}

/** Default actions by brief type */
export const DEFAULT_BRIEF_ACTIONS: Record<string, BriefAction[]> = {
  decision: [
    { key: 'approve', label: '✅ Confirm', type: 'resolve' },
    { key: 'feedback', label: '💬 Revisions', type: 'comment' },
  ],
  error: [
    { key: 'retry', label: '🔄 Retry', type: 'resolve' },
    { key: 'feedback', label: '💬 Feedback', type: 'comment' },
  ],
  insight: [{ key: 'acknowledge', label: '👍 Acknowledged', type: 'resolve' }],
  result: [
    { key: 'approve', label: '✅ Approve', type: 'resolve' },
    { key: 'feedback', label: '💬 Revisions', type: 'comment' },
  ],
};
