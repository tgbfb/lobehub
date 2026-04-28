/**
 * Generate the inline Node.js script that runs inside the sandbox.
 *
 * The script:
 * 1. Spawns `claude` CLI with stream-json output
 * 2. Reads stdout line by line
 * 3. Detects step boundaries (assistant message.id changes)
 * 4. POSTs each step's lines to the TRPC ingest endpoint via curl-style HTTP
 *
 * The script is injected via `runCommand` as `node -e "<script>"`.
 * Environment variables (LOBEHUB_JWT, LOBEHUB_SERVER, CLAUDE_CODE_OAUTH_TOKEN)
 * are injected by preprocessLhCommand or directly via runCommand env.
 */
export function buildSandboxWrapperCommand(params: {
  agentId: string;
  prompt: string;
  resumeSessionId?: string;
  topicId: string;
}): string {
  const { topicId, agentId, prompt, resumeSessionId } = params;

  // Escape single quotes in prompt for safe embedding in JS string
  const escapedPrompt = prompt.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

  const resumeArgs = resumeSessionId ? `'--resume', '${resumeSessionId}',` : '';

  // The inline Node.js script that runs inside the sandbox
  const script = `
const { spawn } = require('child_process');
const { createInterface } = require('readline');
const http = require('http');
const https = require('https');

const SERVER = process.env.LOBEHUB_SERVER || 'https://app.lobehub.com';
const JWT = process.env.LOBEHUB_JWT || '';
const TOPIC_ID = '${topicId}';
const AGENT_ID = '${agentId}';

function post(lines) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ json: { topicId: TOPIC_ID, agentId: AGENT_ID, lines } });
    const url = new URL(SERVER + '/trpc/lambda/cloudClaudeCode.ingest');
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Oidc-Auth': JWT,
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error('POST failed:', res.statusCode, data.slice(0, 200));
        }
        resolve(data);
      });
    });
    req.on('error', (e) => { console.error('POST error:', e.message); resolve(''); });
    req.write(body);
    req.end();
  });
}

const args = [
  '-p', '${escapedPrompt}',
  '--output-format', 'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--permission-mode', 'bypassPermissions',
  ${resumeArgs}
];

const child = spawn('claude', args, {
  env: { ...process.env },
  stdio: ['inherit', 'pipe', 'inherit'],
});

const rl = createInterface({ input: child.stdout });
let buffer = [];
let curMsgId;
let stepCount = 0;

async function flush(lines) {
  if (!lines.length) return;
  stepCount++;
  await post(lines);
  console.error('Step ' + stepCount + ': ' + lines.length + ' events posted');
}

rl.on('line', async (raw) => {
  let line;
  try { line = JSON.parse(raw); } catch { return; }
  if (line.type === 'assistant' && line.message && line.message.id) {
    if (curMsgId && line.message.id !== curMsgId) {
      const prev = buffer;
      buffer = [line];
      await flush(prev);
    } else {
      buffer.push(line);
    }
    curMsgId = line.message.id;
  } else {
    buffer.push(line);
  }
});

child.on('close', async () => {
  await flush(buffer);
  console.error('Done: ' + stepCount + ' step(s)');
});
`.trim();

  // Return as node -e command
  return `node -e '${script.replaceAll("'", "'\\''")}'`;
}
