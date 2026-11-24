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
  return Array.isArray(value?.calls) ? value.calls.filter(c => c && typeof c.name === 'string' && typeof c.call_id === 'string') : [];
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

  async spawn({ projectRoot, worker, task, effort, maxSteps = 16, maxMinutes = 30, runId = newRunId() }) {
    if (typeof task !== 'string' || !task.trim()) throw new Error('task must be non-empty text.');
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new Error('maxSteps must be 1..100.');
    const tools = await ScopedTools.create(projectRoot);
    const settings = await this.provider.settings(worker);
    if (settings.tools === false) throw new Error(`Worker ${worker} is text-only and cannot run an agentic coding task.`);

    const started = Date.now();
    let step = 0;
    let previousResponseId;
    let input = task;
    let currentResponseId = null;
    let cancelled = false;
    let deferredSteer = [];
    const toolAbort = new AbortController();

    this.store.init({
      runId, status: 'running', phase: 'admitted', projectRoot: tools.projectRoot,
      worker: settings.name, model: settings.model, configuredModel: settings.model,
      provider: settings.provider ?? 'openai-responses',
      effort: effort ?? settings.effort_policy?.default ?? null, maxSteps, maxMinutes, task: task.slice(0, 4000),
    });
    this.store.event(runId, 'run.started', {
      projectRoot: tools.projectRoot, worker: settings.name, model: settings.model, configuredModel: settings.model,
      provider: settings.provider ?? 'openai-responses',
    });

    const checkDeadline = () => Date.now() - started > maxMinutes * 60_000;
    const controls = () => this.store.takeControls(runId);

    const applyControls = async () => {
      const incoming = controls();
      const steering = [];
      for (const control of incoming) {
        if (control.type === 'cancel') {
          cancelled = true;
          this.store.event(runId, 'run.cancel_requested', { controlId: control.id });
          toolAbort.abort();
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
      this.store.patchSummary(runId, { status, phase: status, finishedAt: new Date().toISOString(), ...patch });
      this.store.event(runId, `run.${status}`, patch);
      return this.store.readSummary(runId);
    };

    const modelPayload = response => ({
      step,
      responseId: response?.id ?? currentResponseId,
      status: response?.status ?? 'unknown',
      usage: response?.usage ?? null,
      estimatedUsd: response?.estimatedUsd ?? null,
      priceStatus: response?.priceStatus ?? null,
      model: response?.model ?? null,
      provider: response?.provider ?? settings.provider ?? 'openai-responses',
      serviceTier: response?.serviceTier ?? response?.service_tier ?? null,
      substitutedFrom: response?.substitutedFrom ?? null,
      text: String(response?.text ?? '').slice(0, 12000),
    });

    const recordModelFinal = response => {
      const payload = modelPayload(response);
      const summaryPatch = {
        currentResponseId: response?.id ?? currentResponseId,
        ...(response?.model && { model: response.model }),
        ...(response?.serviceTier !== undefined && { serviceTier: response.serviceTier }),
        ...(response?.service_tier !== undefined && { serviceTier: response.service_tier }),
        ...(response?.substitutedFrom && { substitutedFrom: response.substitutedFrom }),
      };
      this.store.patchSummary(runId, summaryPatch);
      this.store.event(runId, 'model.completed', payload);
    };

    const pollUntilFinal = async (phase) => {
      while (true) {
        try {
          const observed = await this.provider.poll({ worker: settings.name, id: currentResponseId });
          if (FINAL.has(observed?.status)) return observed;
          this.store.patchSummary(runId, { phase, currentResponseId });
        } catch (error) {
          this.store.patchSummary(runId, {
            phase,
            currentResponseId,
            providerPollError: String(error?.message ?? error).slice(0, 600),
          });
          this.store.event(runId, 'model.poll_failed', {
            step, responseId: currentResponseId,
            usageDisposition: error?.usageDisposition ?? null,
            reason: String(error?.message ?? error).slice(0, 600),
          });
        }
        await sleep(this.pollIntervalMs);
      }
    };

    const settleCancellation = async reason => {
      if (!currentResponseId) return { id: null, status: 'cancelled', reason: 'No active provider response existed.' };
      let outcome;
      try {
        outcome = await this.provider.cancel({ worker: settings.name, id: currentResponseId });
      } catch (error) {
        outcome = { id: currentResponseId, status: 'cancel_unknown', reason: String(error?.message ?? error).slice(0, 600) };
      }
      this.store.event(runId, 'model.cancelled', { responseId: currentResponseId, reason, outcome });
      const requiresObservation = !FINAL.has(outcome?.status) || (Boolean(settings.provider) && outcome?.status === 'cancelled');
      if (!requiresObservation) return outcome;
      this.store.patchSummary(runId, {
        phase: 'cancellation_pending',
        currentResponseId,
        cancellationStatus: outcome?.status ?? 'cancel_unknown',
      });
      return pollUntilFinal('cancellation_pending');
    };

    const executeTool = async call => {
      let settled = false;
      const promise = tools.execute(call.name, call.args ?? {}, { signal: toolAbort.signal })
        .then(result => { settled = true; return result; })
        .catch(error => { settled = true; return { ok: false, error: String(error?.message ?? error).slice(0, 1000) }; });
      while (!settled) {
        const result = await Promise.race([promise.then(value => ({ done: true, value })), sleep(200).then(() => ({ done: false }))]);
        if (result.done) return result.value;
        const toolControls = await applyControls();
        if (toolControls.length) deferredSteer.push(...toolControls);
        if (cancelled) {
          toolAbort.abort();
          return promise;
        }
      }
      return promise;
    };

    try {
      while (step < maxSteps) {
        if (checkDeadline()) return finish('time_limit', { reason: `Exceeded ${maxMinutes} minute run limit.` });
        const preSteer = [...deferredSteer, ...(await applyControls())];
        deferredSteer = [];
        if (cancelled) return finish('cancelled', { reason: 'Cancelled before provider execution.' });
        if (preSteer.length) {
          const note = preSteer.map(s => `[Operator steering${s.hard ? ', hard' : ''}] ${s.text}`).join('\n\n');
          input = typeof input === 'string' ? `${input}\n\n${note}` : [...input, { role: 'user', content: note }];
          this.store.event(runId, 'run.steer_delivered', { controlIds: preSteer.map(s => s.id), step: step + 1 });
        }

        step++;
        this.store.patchSummary(runId, { phase: 'model', step, currentResponseId: null });
        this.store.event(runId, 'model.requested', { step, previousResponseId: previousResponseId ?? null });

        let response = await this.provider.create({
          worker: settings.name, input, instructions: SYSTEM, tools: tools.schemas(),
          effort: effort ?? settings.effort_policy?.default, previousResponseId, agentId: runId,
        });
        currentResponseId = response.id ?? null;
        this.store.patchSummary(runId, {
          currentResponseId,
          ...(response.model && { model: response.model }),
          ...(response.serviceTier !== undefined && { serviceTier: response.serviceTier }),
          ...(response.substitutedFrom && { substitutedFrom: response.substitutedFrom }),
        });
        this.store.event(runId, 'model.accepted', {
          step, responseId: currentResponseId, status: response.status,
          model: response.model ?? null, provider: response.provider ?? settings.provider ?? 'openai-responses',
          serviceTier: response.serviceTier ?? response.service_tier ?? null,
          substitutedFrom: response.substitutedFrom ?? null,
        });

        let hardRestart = null;
        while (response.status === 'in_progress' || response.status === 'queued') {
          if (checkDeadline()) {
            const terminal = await settleCancellation('time limit');
            recordModelFinal(terminal);
            currentResponseId = null;
            return finish('time_limit', {
              reason: `Exceeded ${maxMinutes} minute run limit.`,
              providerStatus: terminal.status,
              responseId: terminal.id ?? null,
            });
          }

          const steer = await applyControls();
          if (cancelled) {
            const terminal = await settleCancellation('operator cancellation');
            recordModelFinal(terminal);
            currentResponseId = null;
            if (terminal.status === 'cancelled') return finish('cancelled', { reason: 'Provider cancellation confirmed.', responseId: terminal.id ?? null });
            return finish('incomplete', {
              reason: `Cancellation was requested, but the provider had already reached ${terminal.status}; no further tools were executed.`,
              providerStatus: terminal.status,
              responseId: terminal.id ?? null,
            });
          }

          const hard = steer.filter(s => s.hard);
          if (hard.length) {
            const terminal = await settleCancellation('hard steering');
            recordModelFinal(terminal);
            hardRestart = hard;
            this.store.event(runId, 'model.interrupted', {
              responseId: currentResponseId, reason: 'hard steering', providerStatus: terminal.status,
            });
            break;
          }
          if (steer.length) deferredSteer.push(...steer);

          await sleep(this.pollIntervalMs);

          const lateSteer = await applyControls();
          if (cancelled) {
            const terminal = await settleCancellation('operator cancellation');
            recordModelFinal(terminal);
            currentResponseId = null;
            if (terminal.status === 'cancelled') return finish('cancelled', { reason: 'Provider cancellation confirmed.', responseId: terminal.id ?? null });
            return finish('incomplete', {
              reason: `Cancellation was requested, but the provider had already reached ${terminal.status}; no further tools were executed.`,
              providerStatus: terminal.status,
              responseId: terminal.id ?? null,
            });
          }

          const lateHard = lateSteer.filter(s => s.hard);
          if (lateHard.length) {
            const terminal = await settleCancellation('hard steering');
            recordModelFinal(terminal);
            hardRestart = lateHard;
            this.store.event(runId, 'model.interrupted', {
              responseId: currentResponseId, reason: 'hard steering', providerStatus: terminal.status,
            });
            break;
          }
          if (lateSteer.length) deferredSteer.push(...lateSteer);

          try {
            response = await this.provider.poll({ worker: settings.name, id: currentResponseId });
          } catch (error) {
            this.store.patchSummary(runId, {
              phase: 'model_poll_retry',
              currentResponseId,
              providerPollError: String(error?.message ?? error).slice(0, 600),
            });
            this.store.event(runId, 'model.poll_failed', {
              step, responseId: currentResponseId,
              usageDisposition: error?.usageDisposition ?? null,
              reason: String(error?.message ?? error).slice(0, 600),
            });
          }
        }

        if (hardRestart) {
          const note = hardRestart.map(s => `[Operator hard steering] ${s.text}`).join('\n\n');
          input = typeof input === 'string' ? `${input}\n\n${note}` : [...input, { role: 'user', content: note }];
          this.store.event(runId, 'run.steer_delivered', { controlIds: hardRestart.map(s => s.id), step, hard: true });
          currentResponseId = null;
          step--; // interrupted model attempt does not consume the productive step budget
          continue;
        }

        if (!FINAL.has(response.status)) throw new Error(`Unexpected provider status ${response.status}.`);
        recordModelFinal(response);
        if (response.status !== 'completed') {
          currentResponseId = null;
          return finish('failed', {
            reason: response.reason ?? `Provider ended with ${response.status}.`,
            providerStatus: response.status,
            responseId: response.id ?? null,
          });
        }

        const calls = normalizeCalls(response);
        previousResponseId = response.id;
        currentResponseId = null;

        if (!calls.length) {
          const finalSteer = await applyControls();
          if (cancelled) {
            return finish('incomplete', {
              reason: 'Cancellation arrived after the provider response had already completed; no further provider or tool work was started.',
              providerStatus: response.status,
              responseId: response.id ?? null,
            });
          }
          if (finalSteer.length) {
            input = finalSteer.map(s => ({ role: 'user', content: `[Operator steering] ${s.text}` }));
            this.store.event(runId, 'run.steer_delivered', { controlIds: finalSteer.map(s => s.id), step });
            continue;
          }
          return finish('completed', { answer: String(response.text ?? ''), responseId: response.id, steps: step });
        }

        const preToolSteer = await applyControls();
        if (preToolSteer.length) deferredSteer.push(...preToolSteer);
        if (cancelled) {
          return finish('incomplete', {
            reason: 'Cancellation arrived after the provider response completed; pending tool calls were suppressed.',
            providerStatus: response.status,
            responseId: response.id ?? null,
          });
        }

        this.store.patchSummary(runId, { phase: 'tools', activeToolCount: calls.length });
        const outputs = [];
        for (const call of calls) {
          const betweenTools = await applyControls();
          if (betweenTools.length) deferredSteer.push(...betweenTools);
          if (cancelled) {
            return finish('incomplete', {
              reason: 'Cancellation arrived between provider tool calls; remaining tool calls were suppressed.',
              providerStatus: response.status,
              responseId: response.id ?? null,
            });
          }
          this.store.event(runId, 'tool.requested', { step, callId: call.call_id, name: call.name, args: call.args });
          const result = await executeTool(call);
          this.store.event(runId, 'tool.completed', { step, callId: call.call_id, name: call.name, result });
          outputs.push(toolOutput(call, result));
          if (result?.aborted) {
            cancelled = true;
            return finish('cancelled', { reason: 'Active tool subprocess cancellation confirmed by process exit.' });
          }
        }
        input = outputs;
      }
      return finish('step_limit', { reason: `Reached ${maxSteps} model steps.` });
    } catch (error) {
      const disposition = error?.usageDisposition ?? null;
      const responseId = error?.responseId ?? currentResponseId ?? null;
      this.store.event(runId, 'model.request_failed', {
        step,
        responseId,
        usageDisposition: disposition,
        reason: String(error?.message ?? error).slice(0, 1200),
      });
      if (disposition === 'ambiguous') {
        return finish('interrupted', {
          reason: 'Provider submission outcome is ambiguous; remote execution or spend may still exist and must not be treated as zero.',
          detail: String(error?.message ?? error).slice(0, 1200),
          steps: step,
          responseId,
          providerExecutionUnknown: true,
          usageUnknown: true,
          costUnknown: true,
        });
      }
      return finish('failed', { reason: String(error?.message ?? error).slice(0, 1600), steps: step, responseId });
    }
  }

  status(runId) { return this.store.readSummary(runId); }
  events(runId, afterSequence = 0) { return this.store.readEvents(runId, afterSequence); }
  list() { return this.store.list(); }
  steer(runId, text, { hard = false } = {}) { return this.store.enqueueControl(runId, { type: 'steer', text, hard }); }
  cancel(runId) { return this.store.enqueueControl(runId, { type: 'cancel' }); }
}
