import { serve, serveMany } from '@upstash/workflow/hono';
import { Hono } from 'hono';

import { createWorkflowQstashClient } from './qstashClient';
import { hourlyCronHandler } from './workflows/cron/hourly';
import { executeUserHandler as personaExecuteUserHandler } from './workflows/persona/executeUser';
import { paginateUsersHandler as personaPaginateUsersHandler } from './workflows/persona/paginateUsers';
import { processUsersHandler as personaProcessUsersHandler } from './workflows/persona/processUsers';
import { executeUserHandler as topicsExecuteUserHandler } from './workflows/topics/executeUser';
import { extractTopicWorkflow } from './workflows/topics/extractTopic';
import { paginateUsersHandler as topicsPaginateUsersHandler } from './workflows/topics/paginateUsers';
import { processUsersHandler as topicsProcessUsersHandler } from './workflows/topics/processUsers';

const app = new Hono().basePath('/api/workflows/memory-user-memory');

// ─── External cron entry ───────────────────────────────────────────────
app.post('/cron/hourly', serve(hourlyCronHandler, { qstashClient: createWorkflowQstashClient() }));

// ─── Topics pipeline (3 layers + inner extract-topic workflow) ─────────
app.post(
  '/topics/process-users',
  serve(topicsProcessUsersHandler, { qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/topics/paginate-users',
  serve(topicsPaginateUsersHandler, { qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/topics/execute-user',
  serve(topicsExecuteUserHandler, { qstashClient: createWorkflowQstashClient() }),
);

// NOTICE: `context.invoke(extractTopicWorkflow)` in topics/execute-user rewrites the URL last
// segment to the workflowId (`extract-topic`); serveMany dispatches that to the right workflow.
app.post(
  '/topics/extract-topic',
  serveMany(
    { 'extract-topic': extractTopicWorkflow },
    { qstashClient: createWorkflowQstashClient() },
  ),
);

// ─── Persona pipeline (3 layers) ───────────────────────────────────────
app.post(
  '/persona/process-users',
  serve(personaProcessUsersHandler, { qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/persona/paginate-users',
  serve(personaPaginateUsersHandler, { qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/persona/execute-user',
  serve(personaExecuteUserHandler, { qstashClient: createWorkflowQstashClient() }),
);

export default app;
