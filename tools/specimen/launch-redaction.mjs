const SECRET_NAMES = '(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|auth(?:orization)?|password|passwd|cookie|session[_-]?token|client[_-]?secret)';

export function sanitizeCommandLine(value) {
  let text = String(value ?? '');
  if (!text) return '';
  text = text.replace(/(https?:\/\/)[^\s/?#@]+@/gi, '$1[redacted]@');
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [redacted]');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[redacted]');
  text = text.replace(new RegExp(`(\\b${SECRET_NAMES}\\b\\s*=\\s*)([^\\s"']+|"[^"]*"|'[^']*')`, 'gi'), '$1[redacted]');
  text = text.replace(new RegExp(`(--${SECRET_NAMES})(?:=|\\s+)([^\\s"']+|"[^"]*"|'[^']*')`, 'gi'), '$1=[redacted]');
  text = text.replace(/([?&](?:t|token|access_token|refresh_token|api_key|key|auth|authorization)=)[^&#\s]+/gi, '$1[redacted]');
  text = text.replace(/(https?:\/\/[^\s?#]+\?[^\s#]*)/gi, urlText => {
    try {
      const u = new URL(urlText.replace(/^"|"$/g, ''));
      for (const key of [...u.searchParams.keys()]) {
        if (/^(?:t|token|access_token|refresh_token|api_key|key|auth|authorization)$/i.test(key)) u.searchParams.set(key, '[redacted]');
      }
      return u.toString();
    } catch { return urlText; }
  });
  return text.slice(0, 16_000);
}

export function safeLaunchEvent(raw) {
  const pid = Number(raw?.processId);
  const ppid = Number(raw?.parentProcessId);
  return {
    timestampUtc: String(raw?.timestampUtc ?? new Date().toISOString()),
    processId: Number.isInteger(pid) ? pid : null,
    parentProcessId: Number.isInteger(ppid) ? ppid : null,
    name: String(raw?.name ?? '').slice(0, 260),
    executablePath: raw?.executablePath == null ? null : String(raw.executablePath).slice(0, 4096),
    commandLine: sanitizeCommandLine(raw?.commandLine),
    detailsResolved: Boolean(raw?.detailsResolved),
  };
}

export class LaunchFilter {
  constructor({ nameRegex = /claude|anthropic/i, rootPid = null } = {}) {
    this.nameRegex = nameRegex;
    this.rootPid = Number.isInteger(Number(rootPid)) && Number(rootPid) > 0 ? Number(rootPid) : null;
    this.relevant = new Set(this.rootPid ? [this.rootPid] : []);
  }
  accept(raw) {
    const event = safeLaunchEvent(raw);
    const haystack = `${event.name}\n${event.executablePath ?? ''}`;
    const match = this.nameRegex.test(haystack) || this.relevant.has(event.parentProcessId) || this.relevant.has(event.processId);
    this.nameRegex.lastIndex = 0;
    if (match && event.processId) this.relevant.add(event.processId);
    return match ? event : null;
  }
}
