import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { RunController } from '../src/runtime/controller.mjs';
import { fixture, ScriptedProvider } from './helpers.mjs';

test('real Read -> Edit -> Test -> local Git commit loop', async () => {
  const { root, project } = fixture();
  try {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    assert.notEqual(spawnSync(process.execPath, ['--test'], { cwd: project, env }).status, 0);
    const controller = new RunController({ stateDir: join(root,'state'), provider: new ScriptedProvider(), pollIntervalMs: 5 });
    const result = await controller.spawn({ projectRoot: project, worker:'mock', task:'Fix slugify, test it, and commit.', maxSteps:10 });
    assert.equal(result.status, 'completed');
    execFileSync(process.execPath, ['--test'], { cwd: project, stdio:'pipe', env });
    assert.equal(execFileSync('git',['log','-1','--pretty=%s'],{cwd:project,encoding:'utf8'}).trim(),'fix: normalize slugs');
    assert.equal(execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim(),'');
    assert.match(readFileSync(join(project,'src/slug.mjs'),'utf8'), /replace\(/);
    const events = controller.events(result.runId);
    assert(events.some(e => e.type === 'tool.completed' && e.payload.name === 'run_test' && e.payload.result.exitCode === 0));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('scoped tools reject project-root escape', async () => {
  const { root, project } = fixture();
  class EscapeProvider extends ScriptedProvider { async create() { return { id:'resp_escape',status:'completed',text:'',calls:[{call_id:'x',name:'read_file',args:{path:'../outside.txt'}}] }; } }
  try {
    const controller = new RunController({ stateDir:join(root,'state'), provider:new EscapeProvider() });
    const result = await controller.spawn({ projectRoot:project, worker:'mock', task:'Read outside.', maxSteps:1 });
    assert.equal(result.status,'step_limit');
    const tool = controller.events(result.runId).find(e => e.type === 'tool.completed');
    assert.match(tool.payload.result.error,/escapes project root/i);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
