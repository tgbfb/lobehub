import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamps, timestamptz } from './_helpers';
import { agentOperations } from './agentOperations';
import { documents } from './file';
import { llmGenerationTracing } from './llmGenerationTracing';
import { users } from './user';

/**
 * How a single criterion is judged.
 * - program: run a deterministic command / script
 * - agent:   spawn a sub agent_operations to investigate
 * - llm:     call generateObject and let an LLM judge produce a Toulmin verdict
 */
export const verifierTypes = ['program', 'agent', 'llm'] as const;
export type VerifierType = (typeof verifierTypes)[number];

/** What to do when a check item fails. */
export const verifyOnFailStrategies = ['manual', 'auto_repair'] as const;
export type VerifyOnFailStrategy = (typeof verifyOnFailStrategies)[number];

/** Lifecycle of a single check result. */
export const verifyCheckResultStatuses = [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
] as const;
export type VerifyCheckResultStatus = (typeof verifyCheckResultStatuses)[number];

/** Toulmin Claim — the verifier's judgement. */
export const verifyVerdicts = ['passed', 'failed', 'uncertain'] as const;
export type VerifyVerdict = (typeof verifyVerdicts)[number];

/** Human feedback on a result, feeding the data flywheel. */
export const verifyUserDecisions = ['accepted', 'rejected', 'overridden'] as const;
export type VerifyUserDecision = (typeof verifyUserDecisions)[number];

/**
 * Immutable snapshot of one check item, frozen into `agent_operations.verify_plan`
 * when the plan is confirmed. The resolved content (title / verifierConfig) is
 * copied in — not just a criterion FK — so editing the source criterion / rubric
 * never drifts the meaning of a historical plan. `sourceCriterionId` /
 * `sourceRubricId` are provenance pointers only.
 */
export interface VerifyCheckItem {
  /** Stable uuid; `verify_check_results.check_item_id` relates to this, never the index. */
  id: string;
  /** Display ordering only — never used as a relation key. */
  index: number;
  /** What to do when this item fails. */
  onFail: VerifyOnFailStrategy;
  /** Whether failing this item blocks delivery (snapshot may override the source default). */
  required: boolean;
  /** Provenance: the criterion this item was instantiated from, or null when agent-generated. */
  sourceCriterionId?: string | null;
  /** Provenance: the rubric (group) this item came in through, or null. */
  sourceRubricId?: string | null;
  title: string;
  verifierConfig: Record<string, unknown>;
  verifierType: VerifierType;
}

/**
 * Strongly-typed Toulmin narrative for a verdict. Only ever read as a whole, so
 * the narrative elements live in one jsonb column instead of 4-5 half-empty columns.
 * The query-driving Claim (`verdict`) and Qualifier (`confidence`) stay as columns.
 */
export interface ToulminVerdict {
  /** Rebuttal — evidence pointing the other way. */
  counterEvidence?: string;
  /** Data — the evidence collected to support the claim. */
  evidence?: string;
  /** Rebuttal — known limitations of this verifier. */
  limitation?: string;
  /** Warrant — why the evidence supports the claim. */
  reasoning?: string;
}

// ============================================
// 1. verify_criteria — reusable single pass/fail standard (the atomic unit)
// ============================================
export const verifyCriteria = pgTable(
  'verify_criteria',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    title: text('title').notNull(),

    /** Default blocking behaviour; a snapshot item may override it. */
    required: boolean('required').default(true).notNull(),

    verifierType: text('verifier_type', { enum: verifierTypes }).notNull(),

    /** Default verifier parameters used when instantiating a snapshot item. */
    verifierConfig: jsonb('verifier_config').$type<Record<string, unknown>>().default({}),

    /** Default action when this criterion fails. */
    onFail: text('on_fail', { enum: verifyOnFailStrategies }).default('manual').notNull(),

    /**
     * Judging guidance / rule body lives in a document; its edit / iteration history
     * reuses document_history, so no version / is_latest columns are needed here.
     */
    documentId: varchar('document_id', { length: 255 }).references(() => documents.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (t) => [
    index('verify_criteria_user_id_idx').on(t.userId),
    index('verify_criteria_verifier_type_idx').on(t.verifierType),
    index('verify_criteria_document_id_idx').on(t.documentId),
  ],
);

export type NewVerifyCriterion = typeof verifyCriteria.$inferInsert;
export type VerifyCriterionItem = typeof verifyCriteria.$inferSelect;

// ============================================
// 2. verify_rubrics — named group aggregating criteria (the reusable, mountable unit)
// ============================================
export const verifyRubrics = pgTable(
  'verify_rubrics',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    title: text('title').notNull(),
    description: text('description'),

    ...timestamps,
  },
  (t) => [index('verify_rubrics_user_id_idx').on(t.userId)],
);

export type NewVerifyRubric = typeof verifyRubrics.$inferInsert;
export type VerifyRubricItem = typeof verifyRubrics.$inferSelect;

// ============================================
// 3. verify_rubric_criteria — which criteria a rubric aggregates (criteria reusable across rubrics)
// ============================================
export const verifyRubricCriteria = pgTable(
  'verify_rubric_criteria',
  {
    rubricId: uuid('rubric_id')
      .references(() => verifyRubrics.id, { onDelete: 'cascade' })
      .notNull(),

    criterionId: uuid('criterion_id')
      .references(() => verifyCriteria.id, { onDelete: 'cascade' })
      .notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** Display ordering of the criterion within the rubric. */
    sortOrder: integer('sort_order'),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.rubricId, t.criterionId] }),
    index('verify_rubric_criteria_criterion_id_idx').on(t.criterionId),
    index('verify_rubric_criteria_user_id_idx').on(t.userId),
  ],
);

export type NewVerifyRubricCriterion = typeof verifyRubricCriteria.$inferInsert;
export type VerifyRubricCriterionItem = typeof verifyRubricCriteria.$inferSelect;

// ============================================
// 4. verify_check_results — execution result of each check item
// ============================================
export const verifyCheckResults = pgTable(
  'verify_check_results',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    /**
     * The Agent Run this result belongs to. The plan snapshot lives on
     * agent_operations.verify_plan; results relate to it via check_item_id.
     */
    operationId: text('operation_id')
      .references(() => agentOperations.id, { onDelete: 'cascade' })
      .notNull(),

    /** Redundant ownership column — required for list queries / access control. */
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** Stable relation key → agent_operations.verify_plan.items[].id (never the array index). */
    checkItemId: text('check_item_id').notNull(),

    // ---- Flattened item snapshot (denormalized for analytics) ----
    checkItemTitle: text('check_item_title'),
    required: boolean('required').default(true).notNull(),
    /** Display ordering only. */
    checkItemIndex: integer('check_item_index'),

    // ---- Verifier snapshot (Toulmin Backing anchor) ----
    verifierType: text('verifier_type', { enum: verifierTypes }).notNull(),
    verifierConfigHash: text('verifier_config_hash'),

    /** Agent verifier → sub agent_operations (via parent_operation_id chain). */
    verifierOperationId: text('verifier_operation_id').references(() => agentOperations.id, {
      onDelete: 'set null',
    }),
    /** LLM verifier → tracing row. N:1 — a batch generateObject shares one tracing id. */
    verifierTracingId: uuid('verifier_tracing_id').references(() => llmGenerationTracing.id, {
      onDelete: 'set null',
    }),

    status: text('status', { enum: verifyCheckResultStatuses }).default('pending').notNull(),

    // ---- Toulmin model ----
    /** Claim → drives the state machine / FP-FN / aggregation. */
    verdict: text('verdict', { enum: verifyVerdicts }),
    /** Qualifier → 0-1 confidence. */
    confidence: numeric('confidence', { mode: 'number', precision: 3, scale: 2 }),
    /** Data / Warrant / Rebuttal narrative — read as a whole. */
    toulmin: jsonb('toulmin').$type<ToulminVerdict>(),

    /** Forward-looking remediation hint, seeded into auto_repair. */
    suggestion: text('suggestion'),

    // ---- Data flywheel ----
    userDecision: text('user_decision', { enum: verifyUserDecisions }),
    isFalsePositive: boolean('is_false_positive'),
    isFalseNegative: boolean('is_false_negative'),

    /** Auto-repair → new agent_operations (parent chain). */
    repairOperationId: text('repair_operation_id').references(() => agentOperations.id, {
      onDelete: 'set null',
    }),

    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('verify_check_results_operation_id_idx').on(t.operationId),
    index('verify_check_results_user_id_idx').on(t.userId),
    index('verify_check_results_check_item_id_idx').on(t.checkItemId),
    index('verify_check_results_verifier_type_idx').on(t.verifierType),
    index('verify_check_results_verifier_operation_id_idx').on(t.verifierOperationId),
    index('verify_check_results_verifier_tracing_id_idx').on(t.verifierTracingId),
    index('verify_check_results_status_idx').on(t.status),
    index('verify_check_results_verdict_idx').on(t.verdict),
    index('verify_check_results_repair_operation_id_idx').on(t.repairOperationId),
  ],
);

export type NewVerifyCheckResult = typeof verifyCheckResults.$inferInsert;
export type VerifyCheckResultItem = typeof verifyCheckResults.$inferSelect;
