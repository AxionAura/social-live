import type { ServerEvent } from '@social-live/shared';
import type { EventBus } from './lib/bus.js';
import type { Logger } from './lib/logger.js';

export interface NotifyConfig {
  botToken: string | null;
  chatId: string | null;
}

type SendFn = (text: string) => Promise<void>;

function durationOf(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  return mins >= 1 ? `${mins} min` : `${Math.round(ms / 1000)}s`;
}

/** Pure formatter — returns null for events we do not notify about. */
export function formatMessage(type: string, data: unknown): string | null {
  const s = (data ?? {}) as {
    title?: string; errorMessage?: string; startedAt?: string; endedAt?: string;
    destinations?: Array<{ platform?: string }>;
  };
  const title = s.title || 'Untitled stream';
  const platforms = Array.isArray(s.destinations) && s.destinations.length > 0
    ? s.destinations.map((d) => d.platform || '?').join(', ')
    : '—';
  switch (type) {
    case 'stream.started':
      return `\u{1F534} LIVE now: "${title}" \u2192 ${platforms}`;
    case 'stream.completed': {
      const dur = durationOf(s.startedAt, s.endedAt);
      return `\u2705 Stream finished: "${title}"${dur ? ` (${dur})` : ''} \u2192 ${platforms}`;
    }
    case 'stream.stopped':
      return `\u23F9 Stream stopped: "${title}" \u2192 ${platforms}`;
    case 'stream.failed':
      return `\u274C Stream FAILED: "${title}"${s.errorMessage ? ` \u2014 ${s.errorMessage}` : ''}`;
    default:
      return null;
  }
}

export class Notifier {
  private sendFn: SendFn;

  constructor(
    private cfg: NotifyConfig,
    private log?: Pick<Logger, 'info' | 'warn' | 'error'>,
    sendFn?: SendFn,
  ) {
    this.sendFn = sendFn ?? (async (text) => {
      const res = await fetch(`https://api.telegram.org/bot${this.cfg.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.cfg.chatId, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`telegram responded ${res.status}`);
    });
  }

  private get enabled(): boolean {
    return Boolean(this.cfg.botToken && this.cfg.chatId);
  }

  /** Fire-and-forget: never throws, never blocks the stream flow. */
  async deliver(text: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.sendFn(text);
      this.log?.info('Notification sent');
    } catch (e) {
      this.log?.warn(`Notification failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  watch(bus: EventBus): () => void {
    return bus.subscribe((ev: ServerEvent) => {
      const text = formatMessage(ev.type, ev.data);
      if (text) void this.deliver(text);
    });
  }
}
