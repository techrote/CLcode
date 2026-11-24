const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete', 'step_limit', 'time_limit', 'interrupted']);

function cleanNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stepRecord(view, step) {
  const key = Number(step) || 0;
  if (!view.steps[key]) {
    view.steps[key] = {
      step: key,
      status: 'unknown',
      responseId: null,
      previousResponseId: null,
      text: '',
      usage: null,
      estimatedUsd: null,
      tools: [],
      interruptions: 0,
    };
  }
  return view.steps[key];
}

function toolRecord(view, payload) {
  const callId = String(payload.callId ?? '');
  let tool = view.tools.find(t => t.callId === callId);
  if (!tool) {
    tool = {
      callId,
      step: Number(payload.step) || 0,
      name: String(payload.name ?? 'unknown'),
      args: clone(payload.args ?? null),
      result: null,
      status: 'requested',
    };
    view.tools.push(tool);
    const step = stepRecord(view, tool.step);
    if (!step.tools.includes(callId)) step.tools.push(callId);
  }
  return tool;
}

function addTimeline(view, event, category, label, detail = null) {
  view.timeline.push({
    sequence: Number(event.sequence) || 0,
    at: event.at ?? null,
    type: event.type,
    category,
    label,
    detail: clone(detail),
  });
}

function addUsage(view, payload) {
  const usage = payload?.usageStatus === 'unknown' ? null : payload?.usage;
  if (usage && typeof usage === 'object') {
    for (const key of ['input', 'cached', 'output', 'total']) {
      const value = cleanNumber(usage[key]);
      if (value !== null && value >= 0) view.usage[key] += value;
      else if (usage[key] !== undefined) view.usage.unknown = true;
    }
  } else {
    view.usage.unknown = true;
  }
  const usd = cleanNumber(payload?.estimatedUsd);
  if (payload?.priceStatus === 'free' && usd === 0) return;
  if (usage && usd !== null && usd >= 0) view.usage.estimatedUsd += usd;
  else view.usage.costUnknown = true;
}

export function createRunView(seed = {}) {
  return {
    runId: seed.runId ?? null,
    status: seed.status ?? 'unknown',
    phase: seed.phase ?? null,
    terminal: TERMINAL.has(seed.status),
    projectRoot: seed.projectRoot ?? null,
    worker: seed.worker ?? null,
    model: seed.model ?? null,
    provider: seed.provider ?? null,
    effort: seed.effort ?? null,
    task: seed.task ?? null,
    currentResponseId: seed.currentResponseId ?? null,
    currentStep: Number(seed.step ?? 0),
    answer: seed.answer ?? null,
    reason: seed.reason ?? null,
    createdAt: seed.createdAt ?? null,
    updatedAt: seed.updatedAt ?? null,
    finishedAt: seed.finishedAt ?? null,
    lastSequence: 0,
    highestSeenSequence: Number(seed.lastSequence ?? 0),
    gapDetected: false,
    gaps: [],
    steps: {},
    tools: [],
    steering: [],
    timeline: [],
    usage: { input: 0, cached: 0, output: 0, total: 0, estimatedUsd: 0, unknown: false, costUnknown: false },
    accountedResponseIds: [],
  };
}

export function applyRuntimeStatus(view, status) {
  if (!status || typeof status !== 'object') return view;
  if (status.runId) view.runId = status.runId;
  for (const key of ['status', 'phase', 'projectRoot', 'worker', 'model', 'provider', 'effort', 'task', 'currentResponseId', 'answer', 'reason', 'createdAt', 'updatedAt', 'finishedAt']) {
    if (status[key] !== undefined) view[key] = clone(status[key]);
  }
  if (status.step !== undefined) view.currentStep = Number(status.step) || 0;
  if (status.lastSequence !== undefined) view.highestSeenSequence = Math.max(view.highestSeenSequence, Number(status.lastSequence) || 0);
  view.terminal = TERMINAL.has(view.status);
  return view;
}

export function applyRuntimeEvent(view, event) {
  if (!event || typeof event !== 'object') return view;
  const sequence = Number(event.sequence);
  if (!Number.isInteger(sequence) || sequence <= 0) return view;
  if (sequence <= view.lastSequence) return view; // replay/duplicate safe

  if (sequence > view.lastSequence + 1) {
    view.gapDetected = true;
    view.gaps.push({ after: view.lastSequence, before: sequence });
  }
  view.lastSequence = sequence;
  view.highestSeenSequence = Math.max(view.highestSeenSequence, sequence);
  if (event.runId) view.runId = event.runId;
  const p = event.payload ?? {};

  switch (event.type) {
    case 'run.started':
      view.status = 'running';
      view.phase = 'admitted';
      view.terminal = false;
      view.projectRoot = p.projectRoot ?? view.projectRoot;
      view.worker = p.worker ?? view.worker;
      view.model = p.model ?? view.model;
      addTimeline(view, event, 'run', 'Run started', p);
      break;
    case 'run.cancel_requested':
      view.phase = 'cancelling';
      addTimeline(view, event, 'control', 'Cancellation requested', p);
      break;
    case 'run.steer_received': {
      const item = { controlId: p.controlId ?? null, text: p.text ?? '', hard: Boolean(p.hard), receivedSequence: sequence, deliveredSequence: null, step: null };
      view.steering.push(item);
      addTimeline(view, event, 'control', p.hard ? 'Hard steering received' : 'Steering received', item);
      break;
    }
    case 'run.steer_delivered': {
      const ids = Array.isArray(p.controlIds) ? p.controlIds : [];
      for (const id of ids) {
        const existing = view.steering.find(s => s.controlId === id);
        if (existing) { existing.deliveredSequence = sequence; existing.step = Number(p.step) || null; }
        else view.steering.push({ controlId: id, text: '', hard: Boolean(p.hard), receivedSequence: null, deliveredSequence: sequence, step: Number(p.step) || null });
      }
      addTimeline(view, event, 'control', p.hard ? 'Hard steering delivered' : 'Steering delivered', p);
      break;
    }
    case 'model.requested': {
      const step = stepRecord(view, p.step);
      step.status = 'requested';
      step.previousResponseId = p.previousResponseId ?? null;
      view.currentStep = Math.max(view.currentStep, step.step);
      view.phase = 'model';
      addTimeline(view, event, 'model', `Model step ${step.step} requested`, p);
      break;
    }
    case 'model.accepted': {
      const step = stepRecord(view, p.step);
      step.status = p.status ?? 'accepted';
      step.responseId = p.responseId ?? step.responseId;
      step.model = p.model ?? null;
      step.substitutedFrom = p.substitutedFrom ?? null;
      step.serviceTier = p.serviceTier ?? null;
      view.currentResponseId = p.responseId ?? view.currentResponseId;
      addTimeline(view, event, 'model', `Model step ${step.step} accepted`, p);
      break;
    }
    case 'model.interrupted': {
      const step = stepRecord(view, view.currentStep || p.step);
      step.status = 'interrupted';
      step.interruptions++;
      addTimeline(view, event, 'model', 'Model response interrupted', p);
      break;
    }
    case 'model.cancelled':
      if (!p.responseId || !view.accountedResponseIds.includes(p.responseId)) {
        addUsage(view, p.outcome ?? {});
        if (p.responseId) view.accountedResponseIds.push(p.responseId);
      }
      addTimeline(view, event, 'model', 'Provider cancellation observed', p);
      break;
    case 'model.cancel_unconfirmed':
    case 'model.outcome_unknown':
      view.usage.unknown = true;
      view.usage.costUnknown = true;
      addTimeline(view, event, 'model', 'Provider outcome unconfirmed', p);
      break;
    case 'model.completed': {
      const step = stepRecord(view, p.step);
      step.status = p.status ?? 'completed';
      step.responseId = p.responseId ?? step.responseId;
      step.model = p.model ?? step.model ?? null;
      step.substitutedFrom = p.substitutedFrom ?? step.substitutedFrom ?? null;
      step.serviceTier = p.serviceTier ?? step.serviceTier ?? null;
      step.text = String(p.text ?? '');
      step.usage = clone(p.usage ?? null);
      step.estimatedUsd = p.estimatedUsd ?? null;
      view.currentResponseId = null;
      if (!p.responseId || !view.accountedResponseIds.includes(p.responseId)) {
        addUsage(view, p);
        if (p.responseId) view.accountedResponseIds.push(p.responseId);
      }
      addTimeline(view, event, 'model', `Model step ${step.step} completed`, { status: p.status, responseId: p.responseId, usage: p.usage, estimatedUsd: p.estimatedUsd });
      break;
    }
    case 'tool.requested': {
      const tool = toolRecord(view, p);
      tool.status = 'running';
      view.phase = 'tools';
      addTimeline(view, event, 'tool', `${tool.name} requested`, { callId: tool.callId, step: tool.step, args: tool.args });
      break;
    }
    case 'tool.completed': {
      const tool = toolRecord(view, p);
      tool.result = clone(p.result ?? null);
      tool.status = p.result?.aborted ? 'cancelled' : p.result?.ok === false ? 'failed' : 'completed';
      addTimeline(view, event, 'tool', `${tool.name} ${tool.status}`, { callId: tool.callId, step: tool.step, result: tool.result });
      break;
    }
    default:
      if (event.type?.startsWith('run.')) {
        const status = event.type.slice(4);
        if (TERMINAL.has(status)) {
          view.status = status;
          view.phase = status;
          view.terminal = true;
          view.answer = p.answer ?? view.answer;
          view.reason = p.reason ?? view.reason;
          view.finishedAt = p.finishedAt ?? view.finishedAt;
          if (p.steps !== undefined) view.currentStep = Number(p.steps) || view.currentStep;
          addTimeline(view, event, 'run', `Run ${status}`, p);
          break;
        }
      }
      addTimeline(view, event, 'other', event.type ?? 'unknown', p);
      break;
  }
  return view;
}

export function applyRuntimeEvents(view, events) {
  const ordered = [...(events ?? [])].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
  for (const event of ordered) applyRuntimeEvent(view, event);
  return view;
}

export function projectRunView({ status = null, events = [], previous = null } = {}) {
  const view = previous ?? createRunView(status ?? {});
  applyRuntimeStatus(view, status);
  applyRuntimeEvents(view, events);
  return view;
}

export function publicRunView(view) {
  return {
    ...clone(view),
    steps: Object.values(view.steps).sort((a, b) => a.step - b.step),
    activeTools: view.tools.filter(t => t.status === 'running').map(t => t.callId),
    pendingSteering: view.steering.filter(s => !s.deliveredSequence).map(s => s.controlId),
  };
}
