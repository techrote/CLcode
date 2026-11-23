import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('runtime refuses a dirty project at admission', async () => {
  const { root, project } = fixture();
  try {
    writeFileSync(join(project, 'src', 'dirty.txt'), 'unrelated');
    const controller = new RunController({ stateDir: join(root,'state'), provider: new ScriptedProvider() });
    await assert.rejects(controller.spawn({ projectRoot: project, worker:'mock', task:'Do work.', maxSteps:1 }), /working tree must be clean/i);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('commit includes only CLcode-edited paths and rejects a touched file changed afterward', async () => {
  const { root, project } = fixture();
  try {
    const tools = await (await import('../src/runtime/tools.mjs')).ScopedTools.create(project);
    tools.editFile({ path:'src/slug.mjs', old_text:'return String(value).trim().toLowerCase();', new_text:"return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');" });
    writeFileSync(join(project,'unrelated.txt'),'concurrent user edit');
    const committed = await tools.gitLocal({ action:'commit', message:'fix: slug only' });
    assert.equal(committed.ok,true);
    assert.match(execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}),/\?\? unrelated\.txt/);
    assert(!execFileSync('git',['show','--name-only','--pretty=','HEAD'],{cwd:project,encoding:'utf8'}).includes('unrelated.txt'));

    const tools2 = await (await import('../src/runtime/tools.mjs')).ScopedTools.create(project,{requireClean:false});
    tools2.editFile({ path:'src/slug.mjs', old_text:"replace(/^-|-$/g, '');", new_text:"replace(/^-+|-+$/g, '');" });
    writeFileSync(join(project,'src','slug.mjs'), readFileSync(join(project,'src','slug.mjs'),'utf8') + '\n// external change\n');
    await assert.rejects(tools2.gitLocal({ action:'commit', message:'should refuse' }), /changed after CLcode's last edit/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('Windows termination plan kills the complete child process tree', async () => {
  const { terminationPlan } = await import('../src/runtime/tools.mjs');
  assert.deepEqual(terminationPlan('win32', 4321), { file:'taskkill', args:['/PID','4321','/T','/F'] });
  assert.deepEqual(terminationPlan('linux', 4321), { signal:'SIGTERM' });
});
