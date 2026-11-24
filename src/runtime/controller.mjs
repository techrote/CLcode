import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { RunStore, newRunId } from './journal.mjs';
import { ScopedTools } from './tools.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete']);

const SYSTEM = `You are the principal coding agent in CLcode, an independent desktop-oriented development harness.
You operate only through the provided tools. Inspect files before editing them. Do not claim a file was changed or a test passed unless a tool result confirms it.
Use the narrowest useful sequence: read relevant files, make precise edits, run the provided test command, inspect Git diff/status, and commit locally only when the task asks for a commit.
The host enforces the project boundary and exposes no network, package-install or remote-Git tool. Treat tool errors as facts and recover within scope.
When the task is complete, respond with a concise summary of changes, tests and the local commit if one was created.`;

function toolOutput(call, result) {
  return { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) };
}

function normalizeCalls(value) {
  if (value?.calls == null) return [];
  if (!Array.isArray(value.calls)) throw new Error('Provider tool batch is not an array.');
  const ids = new Set();
  for (const call of value.calls) {
    if (!call || typeof call.name !== 'string' || !call.name || typeof call.call_id !== 'string' || !call.call_id || ids.has(call.call_id)) throw new Error('Provider tool batch has malformed or duplicate call identity; no tools executed.');
    if (call.args != null && (typeof call.args !== 'object' || Array.isArray(call.args))) throw new Error('Provider tool batch has malformed arguments; no tools executed.');
    ids.add(call.call_id);
  }
  return value.calls;
}

export class RunController {
  constructor({ stateDir, provider, pollIntervalMs = 500 } = {}) {
    if (!provider) throw new Error('provider is required.');
    this.stateDir = resolve(stateDir ?? '.clcode-state');
    mkdirSync(this.stateDir, { recursive: true });
    this.store = new RunStore(this.stateDir);
    this.provider = provider;
    this.pollIntervalMs = pollIntervalMs;
  }

  async spawn({ projectRoot, worker, task, effort, maxSteps = 16, maxMinutes = 30, runId = newRunId(), onAdmitted }) {
    runId = String(runId).toUpperCase();
    if (!/^R[0-9A-Z]{8,24}$/.test(runId)) throw new Error('Invalid run id.');
    if (typeof task !== 'string' || !task.trim()) throw new Error('task must be non-empty text.');
    if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) throw new Error('maxMinutes must be a positive finite number.');
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new Error('maxSteps must be 1..100.');
    const tools = await ScopedTools.create(projectRoot, { requireClean: false });
    const lease = await tools.acquireRunLease(runId, this.stateDir);
    let release = true;
    try {
      // Existing pre-lease snapshots also fail closed in this state directory.
      const sameRoot = path => typeof path === 'string' && (process.platform === 'win32' ? path.toLowerCase() === tools.projectRoot.toLowerCase() : path === tools.projectRoot);
      if (this.store.list().some(r => sameRoot(r.projectRoot) && (r.status === 'running' || r.providerState === 'unknown' || r.toolState === 'unknown'))) {
        throw new Error('Project has an active or unreconciled run in this state directory.');
      }
      await tools.verifyClean();
      const settings = await this.provider.settings(worker);
      if (settings.tools === false) throw new Error('Worker ' + worker + ' is text-only and cannot run an agentic coding task.');
      const result = await this.#run({ tools, settings, task, effort, maxSteps, maxMinutes, runId, onAdmitted, onPersisted: () => { release = false; } });
      release = Boolean(result && result.status !== 'running' && !['unknown','submitting','queued','in_progress'].includes(result.providerState) && result.toolState !== 'unknown');
      return result;
    } finally { if (release) lease.release(); }
  }

  async #run({ tools, settings, task, effort, maxSteps, maxMinutes, runId, onAdmitted, onPersisted }) {
    const started = performance.now();
    let step = 0;
    let attempt = 0;
    let previousResponseId;
    let input = task;
    let currentResponseId = null, currentRequestId = null;
    const seenResponseIds = new Set();
    let remoteUnresolved = false, toolUnresolved = false, finishing = false;
    let cancelled = false;
    let cancellationConfirmed = false;
    let deferredSteer = [];
    const toolAbort = new AbortController();

    this.store.init({
      runId, status: 'running', phase: 'admitted', projectRoot: tools.projectRoot,
      worker: settings.name, model: settings.model, provider: settings.provider ?? 'openai-responses',
      effort: effort ?? settings.effort_policy?.default ?? null, requestedServiceTier: settings.service_tier ?? null, maxSteps, maxMinutes, task: task.slice(0, 4000),
    });
    onPersisted();
    this.store.event(runId, 'run.started', { projectRoot: tools.projectRoot, worker: settings.name, model: settings.model });
    onAdmitted?.(this.store.readSummary(runId));

    const checkDeadline = () => performance.now() - started >= maxMinutes * 60_000;
    const controls = () => this.store.takeControls(runId);
    // Chat transport aborts are local observations, not authoritative upstream cancellation.
    const cancelActive = async () => {
      const outcome = currentResponseId
        ? await this.provider.cancel({ worker: settings.name, id: currentResponseId }).catch(() => ({ status: 'cancel_unknown' }))
        : { status: 'cancel_unknown' };
      const confirmed = Boolean(currentResponseId && outcome?.id === currentResponseId && outcome.status === 'cancelled' && (!settings.provider || settings.provider === 'openai-responses' || settings.provider === 'openai'));
      this.store.event(runId, confirmed ? 'model.cancelled' : 'model.cancel_unconfirmed', { responseId: currentResponseId, outcome });
      if (confirmed) remoteUnresolved = false;
      this.store.patchSummary(runId, { providerState: confirmed ? 'cancelled' : 'unknown', ...(confirmed && { currentResponseId: null, lastResponseId: currentResponseId }) });
      return confirmed;
    };

    const applyControls = async ({ whileResponse = false } = {}) => {
      const incoming = controls();
      const steering = [];
      for (const control of incoming) {
        if (control.type === 'cancel') {
          cancelled = true;
          this.store.event(runId, 'run.cancel_requested', { controlId: control.id });
          toolAbort.abort();
          if (whileResponse && !cancellationConfirmed) {
            cancellationConfirmed = await cancelActive();
          }
        } else if (control.type === 'steer') {
          const text = String(control.text ?? '').trim();
          if (!text) continue;
          steering.push({ ...control, text });
          this.store.event(runId, 'run.steer_received', { controlId: control.id, hard: Boolean(control.hard), text: text.slice(0, 2000) });
        }
      }
      return steering;
    };

    const finish = (status, patch = {}) => {
      finishing = true;
      return this.store.finish(runId, status, { steps: step, attempts: attempt, activeToolCount: 0, ...patch });
    };

    const providerUnknown = (operation, error, requestId, responseId = currentResponseId) => {
      const reason = String(error?.message ?? error).slice(0, 1600);
      const patch = { reason, requestId, currentResponseId: responseId ?? null, providerState: 'unknown', usageDisposition: 'ambiguous' };
      this.store.event(runId, 'model.outcome_unknown', { operation, step, ...patch, responseId: responseId ?? null });
      return finish('incomplete', patch);
    };

    const executeTool = async (call) => {
      let settled = false;
      toolUnresolved = true;
      const promise = tools.execute(call.name, call.args ?? {}, { signal: toolAbort.signal })
        .then(result => { settled = true; return result; })
        .catch(error => { settled = true; return { ok: false, error: String(error?.message ?? error).slice(0, 1000) }; });
      try {
        while (!settled) {
          const result = await Promise.race([promise.then(value => ({ done: true, value })), sleep(200).then(() => ({ done: false }))]);
          if (result.done) return result.value;
          const toolControls = await applyControls();
          if (toolControls.length) deferredSteer.push(...toolControls);
          if (cancelled || checkDeadline()) {
            toolAbort.abort();
            return promise;
          }
        }
        return promise;
      } catch (error) {
        // Storage/control errors cannot abandon a still-running subprocess.
        // Stop and join the tool before publishing any local final state.
        toolAbort.abort();
        const result = await promise;
        return { ...result, ok:false, controlFailure:true, error:String(error?.message ?? error).slice(0,1000) };
      }
    };

    try {
      // The public step budget also bounds total potentially billable attempts,
      // including hard-interrupted attempts.
      while (step < maxSteps && attempt < maxSteps) {
        if (checkDeadline()) return finish('time_limit', { reason: `Exceeded ${maxMinutes} minute run limit.` });
        const preSteer = [...deferredSteer, ...(await applyControls())];
        deferredSteer = [];
        if (cancelled) return finish('cancelled', { reason: 'Cancelled by operator.' });
        if (preSteer.length) {
          const note = preSteer.map(s => `[Operator steering${s.hard ? ', hard' : ''}] ${s.text}`).join('\n\n');
          input = typeof input === 'string' ? `${input}\n\n${note}` : [...input, { role: 'user', content: note }];
        }

        step++;
        const requestId = currentRequestId = `${runId}:${++attempt}`;
        this.store.patchSummary(runId, { phase: 'model', step, currentResponseId: null, requestId, providerState: 'submitting' });
        this.store.event(runId, 'model.requested', { step, requestId, previousResponseId: previousResponseId ?? null });

        let response;
        try {
          remoteUnresolved = true;
          response = await this.provider.create({
            worker: settings.name, input, instructions: SYSTEM, tools: tools.schemas(),
            effort: effort ?? settings.effort_policy?.default, previousResponseId, agentId: runId, requestId,
          });
        } catch (error) {
          if (['not_started', 'rejected'].includes(error?.usageDisposition)) {
            remoteUnresolved = false;
            const patch = { reason: String(error?.message ?? error).slice(0, 1600), requestId, providerState: error.usageDisposition, usageDisposition: error.usageDisposition, currentResponseId: null };
            this.store.event(runId, 'model.request_rejected', { step, ...patch });
            return finish('failed', patch);
          }
          return providerUnknown('create', error, requestId, error?.responseId);
        }
        if (typeof response?.id !== 'string' || !response.id) return providerUnknown('create', new Error('Provider returned no response ID.'), requestId);
        if (seenResponseIds.has(response.id)) return providerUnknown('create', new Error('Provider reused a response ID for a new request; no tools executed.'), requestId, response.id);
        seenResponseIds.add(response.id);
        currentResponseId = response.id;
        this.store.patchSummary(runId, { currentResponseId, providerState: response.status, currentResponseModel: response.model ?? null });
        this.store.event(runId, 'model.accepted', { step, requestId, responseId: currentResponseId, status: response.status,
          model: response.model ?? null, configuredModel: settings.model, substitutedFrom: response.substitutedFrom ?? null, provider: response.provider ?? settings.provider ?? 'openai-responses', serviceTier: response.serviceTier ?? null });
        if (preSteer.length) this.store.event(runId, 'run.steer_delivered', { controlIds: preSteer.map(s => s.id), step, requestId, responseId: currentResponseId, hard: preSteer.some(s => s.hard) });

        let hardRestart = null;
        while (response.status === 'in_progress' || response.status === 'queued') {
          if (checkDeadline()) {
            if (!await cancelActive()) return finish('incomplete', { reason: 'Run deadline reached; upstream cancellation is unconfirmed.', providerState: 'unknown' });
            return finish('time_limit', { reason: `Exceeded ${maxMinutes} minute run limit.`, currentResponseId: null });
          }
          const steer = await applyControls({ whileResponse: true });
          if (cancelled) return cancellationConfirmed
            ? finish('cancelled', { reason: 'Cancelled by operator during model response.', currentResponseId: null })
            : finish('incomplete', { reason: 'Operator requested cancellation; upstream cancellation is unconfirmed.', providerState: 'unknown' });
          const hard = steer.filter(s => s.hard);
          if (hard.length) {
            if (!await cancelActive()) return finish('incomplete', { reason: 'Hard steering stopped: upstream cancellation is unconfirmed; no replacement request was sent.', providerState: 'unknown' });
            hardRestart = steer;
            this.store.event(runId, 'model.interrupted', { responseId: currentResponseId, reason: 'hard steering' });
            break;
          }
          if (steer.length) {
            // Soft steering is delivered on the next model step after this response completes.
            deferredSteer.push(...steer);
          }
          await sleep(this.pollIntervalMs);
          const lateSteer = await applyControls({ whileResponse: true });
          if (cancelled) return cancellationConfirmed
            ? finish('cancelled', { reason: 'Cancelled by operator during model response.', currentResponseId: null })
            : finish('incomplete', { reason: 'Operator requested cancellation; upstream cancellation is unconfirmed.', providerState: 'unknown' });
          const lateHard = lateSteer.filter(s => s.hard);
          if (lateHard.length) {
            if (!await cancelActive()) return finish('incomplete', { reason: 'Hard steering stopped: upstream cancellation is unconfirmed; no replacement request was sent.', providerState: 'unknown' });
            hardRestart = lateSteer;
            this.store.event(runId, 'model.interrupted', { responseId: currentResponseId, reason: 'hard steering' });
            break;
          }
          if (lateSteer.length) deferredSteer.push(...lateSteer);
          try {
            response = await this.provider.poll({ worker: settings.name, id: currentResponseId });
            if (response?.id !== currentResponseId) throw new Error('Poll returned a different response ID.');
          } catch (error) {
            return providerUnknown('poll', error, requestId);
          }
        }

        if (hardRestart) {
          // Only an accepted replacement can acknowledge delivery. Preserve
          // deferred controls even if the total attempt budget is exhausted.
          deferredSteer.push(...hardRestart);
          currentResponseId = null;
          step--;
          continue;
        }

        if (!FINAL.has(response.status)) return providerUnknown('response', new Error(`Unexpected provider status ${response.status}.`), requestId);
        remoteUnresolved = false;
        this.store.event(runId, 'model.completed', {
          step, responseId: response.id, status: response.status, usage: response.usage ?? null,
          estimatedUsd: response.estimatedUsd ?? null, usageStatus: response.usageStatus ?? (response.usage ? 'verified' : 'unknown'), priceStatus: response.priceStatus ?? null,
          model: response.model ?? null, configuredModel: settings.model, substitutedFrom: response.substitutedFrom ?? null, provider: response.provider ?? settings.provider ?? 'openai-responses', serviceTier: response.serviceTier ?? null,
          text: String(response.text ?? '').slice(0, 12000),
        });
        this.store.patchSummary(runId, { providerState: response.status, lastResponseId: response.id, lastResponseModel: response.model ?? null, lastResponseServiceTier: response.serviceTier ?? null, currentResponseId: null });
        if (response.status !== 'completed') return finish(response.status, { reason: response.reason ?? `Provider ended with ${response.status}.` });

        const calls = normalizeCalls(response);
        previousResponseId = response.id;
        currentResponseId = null;
        this.store.patchSummary(runId, { currentResponseId: null });

        const returnedControls = await applyControls();
        if (cancelled) return finish('cancelled', { reason: 'Cancelled by operator after provider response.', currentResponseId: null });
        if (checkDeadline()) return finish('time_limit', { reason: 'Provider completed after run deadline; no further work executed.', currentResponseId: null });
        if (!calls.length) {
          const finalSteer = [...deferredSteer, ...returnedControls];
          deferredSteer = [];
          if (cancelled) return finish('cancelled', { reason: 'Cancelled by operator.' });
          if (finalSteer.length) {
            input = [];
            deferredSteer.push(...finalSteer);
            continue;
          }
          return finish('completed', { answer: String(response.text ?? ''), responseId: response.id, steps: step });
        }

        deferredSteer.push(...returnedControls);
        this.store.patchSummary(runId, { phase: 'tools', activeToolCount: calls.length });
        const outputs = [];
        for (const call of calls) {
          deferredSteer.push(...await applyControls());
          if (checkDeadline() && !cancelled) return finish('time_limit', { reason: `Exceeded ${maxMinutes} minute run limit before tool execution.`, currentResponseId: null });
          if (cancelled) return finish('cancelled', { reason: 'Cancelled by operator.' });
          this.store.event(runId, 'tool.requested', { step, callId: call.call_id, name: call.name, args: call.args });
          const result = await executeTool(call);
          toolUnresolved = result?.terminationConfirmed === false || result?.effectUnknown === true;
          this.store.event(runId, 'tool.completed', { step, callId: call.call_id, name: call.name, result });
          outputs.push(toolOutput(call, result));
          if (toolUnresolved) return finish('incomplete', { reason: 'Tool termination or its resulting effect could not be confirmed.', toolState: 'unknown' });
          if (result?.controlFailure) return finish('failed', { reason: 'Control ingestion failed; active tool was stopped: ' + result.error });
          deferredSteer.push(...await applyControls());
          if (cancelled) return finish('cancelled', { reason: 'Tool execution stopped by operator.' });
          if (checkDeadline()) return finish('time_limit', { reason: 'Run deadline reached during tool execution.' });
          if (result?.aborted) return finish('cancelled', { reason: 'Tool execution cancelled.' });
        }
        input = outputs;
      }
      return finish('step_limit', { reason: `Reached ${maxSteps} total model attempts.`, ...(deferredSteer.length && { undeliveredControlIds: deferredSteer.map(s => s.id) }) });
    } catch (error) {
      if (finishing) throw error; // never append a second terminal event after a failed persistence operation
      const reason = String(error?.message ?? error).slice(0, 1600);
      if (remoteUnresolved || toolUnresolved) return finish('incomplete', { reason, ...(remoteUnresolved && { providerState: 'unknown', currentResponseId, requestId: currentRequestId, usageDisposition: 'ambiguous' }), ...(toolUnresolved && { toolState: 'unknown' }) });
      return finish('failed', { reason, steps: step });
    }
  }

  status(runId) { return this.store.readSummary(runId); }
  events(runId, afterSequence = 0) { return this.store.readEvents(runId, afterSequence); }
  list() { return this.store.list(); }
  steer(runId, text, { hard = false } = {}) { return this.store.enqueueControl(runId, { type: 'steer', text, hard }); }
  cancel(runId) { return this.store.enqueueControl(runId, { type: 'cancel' }); }
}
