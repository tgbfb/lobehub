export const LobeAgentIdentifier = 'lobe-agent';

export const LobeAgentApiName = {
  analyzeVisualMedia: 'analyzeVisualMedia',
  callSubAgent: 'callSubAgent',
  callSubAgents: 'callSubAgents',
  clearTodos: 'clearTodos',
  createPlan: 'createPlan',
  createTodos: 'createTodos',
  updatePlan: 'updatePlan',
  updateTodos: 'updateTodos',
  vent: 'vent',
} as const;

export type LobeAgentApiNameType = (typeof LobeAgentApiName)[keyof typeof LobeAgentApiName];

// ==================== Vent ====================

/**
 * Friction categories an agent may vent about. These describe blockers in the
 * agent's own working conditions, reported back to the platform builders — not
 * user-facing answers.
 */
export const VENT_CATEGORIES = [
  'missing_tool',
  'schema_mismatch',
  'doc_conflict',
  'platform_bug',
  'env_limitation',
  'other',
] as const;

/** Severity describing how badly the friction blocked the task. */
export const VENT_SEVERITIES = ['low', 'medium', 'high'] as const;

/** Evidence reference type accepted alongside a vent. */
export const VENT_EVIDENCE_REF_TYPES = [
  'tool_call',
  'message',
  'operation',
  'topic',
  'task',
  'source',
] as const;

/** Friction category reported by a running agent. */
export type VentCategory = (typeof VENT_CATEGORIES)[number];

/** Severity assigned by the running agent to one vent. */
export type VentSeverity = (typeof VENT_SEVERITIES)[number];

/** Evidence reference type accepted alongside a vent. */
export type VentEvidenceRefType = (typeof VENT_EVIDENCE_REF_TYPES)[number];

/** Optional reference that grounds one vent report. */
export interface VentEvidenceRef {
  /** Stable evidence identifier in its source domain. */
  id: string;
  /** Optional short note explaining why this evidence matters. */
  summary?: string;
  /** Evidence object type. */
  type: VentEvidenceRefType;
}

/** Parameters for the vent API. */
export interface VentParams {
  /** How many times the agent failed at this before venting. */
  attempts?: number;
  /** Friction category the vent is about. */
  category: VentCategory;
  /** What happened, what was expected, and what is blocked. */
  details: string;
  /** Evidence references that ground the report. */
  evidenceRefs?: VentEvidenceRef[];
  /** Severity describing how badly the friction blocked the task. */
  severity: VentSeverity;
  /** One-line summary of the friction. */
  summary: string;
  /** Tool / API / surface involved, when one specific component is to blame. */
  toolName?: string;
}

export type VentRejectionReason = 'invalid_category' | 'invalid_severity' | 'rate_limited';

export type VentStateReason = VentRejectionReason | 'missing_context' | 'runtime_error' | null;

/** State persisted on the vent tool message for inspector display. */
export interface VentState {
  /** Friction category for inspector display. */
  category?: VentCategory;
  /** Rejection or runtime reason. */
  reason?: VentStateReason;
  /** Whether the vent crossed the recording boundary. */
  recorded: boolean;
  /** Severity for inspector display. */
  severity?: VentSeverity;
  /** Stable vent id for recorded reports. */
  ventId?: null | string;
}

export interface AnalyzeVisualMediaParams {
  question: string;
  refs?: string[];
  urls?: string[];
}

export interface AnalyzeVisualMediaFileSummary {
  id?: string;
  name: string;
  ref: string;
  type: 'image' | 'video';
}

export interface AnalyzeVisualMediaState {
  files?: AnalyzeVisualMediaFileSummary[];
  model?: string;
  provider?: string;
  trigger?: string;
  usage?: unknown;
}

// ==================== Sub-Agent Tasks ====================

/**
 * Single sub-agent task definition.
 *
 * A sub-agent is a long-running, isolated execution that runs in its own
 * context (server or desktop client) and reports back to the parent
 * conversation when it finishes.
 */
export interface SubAgentTask {
  /** Brief description of what this sub-agent does (shown in UI) */
  description: string;
  /** Whether to inherit context messages from parent conversation */
  inheritMessages?: boolean;
  /** Detailed instruction/prompt for the sub-agent execution */
  instruction: string;
  /**
   * Whether to execute the sub-agent on the client side (desktop only).
   * When true and running on desktop, the sub-agent runs locally with
   * access to local tools (file system, shell commands, etc.).
   *
   * MUST be true when the sub-agent requires local-system tools.
   */
  runInClient?: boolean;
  /** Timeout in milliseconds (optional, default 30 minutes) */
  timeout?: number;
}

/**
 * Parameters for callSubAgent API
 * Dispatch a single sub-agent.
 */
export interface CallSubAgentParams {
  description: string;
  inheritMessages?: boolean;
  instruction: string;
  runInClient?: boolean;
  timeout?: number;
}

/**
 * Parameters for callSubAgents API
 * Dispatch one or more sub-agents in parallel.
 */
export interface CallSubAgentsParams {
  tasks: SubAgentTask[];
}

/** Execution stats reported back by a finished sub-agent run. */
export interface SubAgentRunStats {
  /** Model the sub-agent ran on */
  model?: string;
  /** Total tokens consumed by the sub-agent run */
  totalTokens?: number;
  /** Number of tool calls the sub-agent made */
  totalToolCalls?: number;
}

/**
 * State persisted on the callSubAgent tool message.
 *
 * The sub-agent runs in an isolated Thread via the current runtime; the Render
 * uses `threadId` to open that Thread in the portal, and the stats feed the
 * Inspector row.
 */
export interface CallSubAgentState extends SubAgentRunStats {
  threadId: string;
}

/** State persisted on the callSubAgents tool message (one entry per sub-agent). */
export interface CallSubAgentsState {
  subAgents: ({ description: string; threadId: string } & SubAgentRunStats)[];
}

// ==================== Todo Item ====================

/** Status of a todo item */
export type TodoStatus = 'todo' | 'processing' | 'completed';

export interface TodoItem {
  /** Status of the todo item */
  status: TodoStatus;
  /** The todo item text */
  text: string;
}

/** Get the next status in the cycle: todo → processing → completed → todo */
export const getNextTodoStatus = (current: TodoStatus): TodoStatus => {
  const cycle: TodoStatus[] = ['todo', 'processing', 'completed'];
  const index = cycle.indexOf(current);
  return cycle[(index + 1) % cycle.length];
};

export interface TodoList {
  items: TodoItem[];
  updatedAt: string;
}

/** Alias for TodoList, used for state storage in Plan metadata */
export type TodoState = TodoList;

// ==================== Todo Params ====================

/**
 * Create new todo items
 * - AI input: { adds: string[] } - array of text strings from AI
 * - After user edit: { items: TodoItem[] } - saved format with TodoItem objects
 */
export interface CreateTodosParams {
  /** Array of text strings from AI */
  adds?: string[];
  /** Array of TodoItem objects (saved format after user edit) */
  items?: TodoItem[];
}

/**
 * Update operation types for batch updates
 */
export type TodoUpdateOperationType = 'add' | 'update' | 'remove' | 'complete' | 'processing';

/**
 * Single update operation
 */
export interface TodoUpdateOperation {
  /** For 'update', 'remove', 'complete', 'processing': the index of the item (0-based) */
  index?: number;
  /** For 'update': the new text */
  newText?: string;
  /** For 'update': the new status */
  status?: TodoStatus;
  /** For 'add': the text to add */
  text?: string;
  /** Operation type */
  type: TodoUpdateOperationType;
}

/**
 * Update todo list with batch operations
 * Supports: add, update, remove, complete, processing
 */
export interface UpdateTodosParams {
  /** Array of update operations to apply */
  operations: TodoUpdateOperation[];
}

/**
 * Clear todo items
 */
export interface ClearTodosParams {
  /** Clear mode: 'completed' only clears done items, 'all' clears everything */
  mode: 'completed' | 'all';
}

// ==================== Todo State Types for Render ====================

export interface CreateTodosState {
  /** Items that were created */
  createdItems: string[];
  /** Current todo list after creation */
  todos: TodoList;
}

export interface UpdateTodosState {
  /** Operations that were applied */
  appliedOperations: TodoUpdateOperation[];
  /** Current todo list after update */
  todos: TodoList;
}

export interface CompleteTodosState {
  /** Indices that were completed */
  completedIndices: number[];
  /** Current todo list after completion */
  todos: TodoList;
}

export interface RemoveTodosState {
  /** Indices that were removed */
  removedIndices: number[];
  /** Current todo list after removal */
  todos: TodoList;
}

export interface ClearTodosState {
  /** Number of items cleared */
  clearedCount: number;
  /** Mode used for clearing */
  mode: 'completed' | 'all';
  /** Current todo list after clearing */
  todos: TodoList;
}

// ==================== Planning Params ====================

/**
 * Create a high-level plan document
 * Plans define the strategic direction (what and why), not actionable steps
 *
 * Field mapping to Document:
 * - goal -> document.title
 * - description -> document.description
 * - context -> document.content
 */
export interface CreatePlanParams {
  /** Detailed context, background, constraints (maps to document.content) */
  context?: string;
  /** Brief summary of the plan (maps to document.description) */
  description: string;
  /** The main goal or objective to achieve (maps to document.title) */
  goal: string;
}

export interface UpdatePlanParams {
  /** Mark plan as completed */
  completed?: boolean;
  /** Updated context (maps to document.content) */
  context?: string;
  /** Updated description (maps to document.description) */
  description?: string;
  /** Updated goal (maps to document.title) */
  goal?: string;
  /** Plan ID to update */
  planId: string;
}

// ==================== Plan Result Types ====================

/**
 * A high-level plan document
 * Contains goal and context, but no steps (steps are managed via Todos)
 *
 * Field mapping to Document:
 * - goal -> document.title
 * - description -> document.description
 * - context -> document.content
 */
export interface Plan {
  /** Whether the plan is completed */
  completed: boolean;
  /** Detailed context, background, constraints (maps to document.content) */
  context?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Brief summary of the plan (maps to document.description) */
  description: string;
  /** The main goal or objective (maps to document.title) */
  goal: string;
  /** Unique plan identifier */
  id: string;
  /** Last update timestamp */
  updatedAt: string;
}

// ==================== Plan State Types for Render ====================

export interface CreatePlanState {
  /** The created plan document */
  plan: Plan;
}

export interface UpdatePlanState {
  /** The updated plan document */
  plan: Plan;
}
