// Run after building @athanor/node-definitions; --check verifies the packaged API mirror.
import { readFileSync, writeFileSync } from 'node:fs';
import { AGENT_STUDIO_NODE_DEFINITIONS } from '../packages/node-definitions/dist/index.js';
const target = new URL('../apps/api/athanor_api/agent_catalog.json', import.meta.url);
const content = JSON.stringify(AGENT_STUDIO_NODE_DEFINITIONS, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content) throw new Error('Agent catalog drift: run node scripts/sync-agent-catalog.mjs');
} else writeFileSync(target, content);
