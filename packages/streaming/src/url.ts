import { lookup as dnsLookup } from 'node:dns/promises';

export class InvalidStreamTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStreamTargetError';
  }
}

export interface StreamTarget {
  url: string;
  protocol: 'rtmp' | 'rtmps';
  host: string;
  port: number;
}

/**
 * Report whether an IP address belongs to a private, loopback or otherwise
 * non-public range. Supports IPv4 and IPv6 (including IPv4-mapped IPv6).
 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (norm === '::' || norm === '::1') return true;
  if (norm.startsWith('::ffff:')) return isPrivateAddress(norm.slice(7));
  if (norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) return true; // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique local
  if (norm.startsWith('ff')) return true; // multicast
  return false;
}

function isInternalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home')
  );
}

/**
 * Validate a streaming (RTMP/RTMPS) target URL and guard against SSRF:
 * only rtmp/rtmps protocols are allowed and the host must not resolve to a
 * private/loopback network (unless explicitly allowed for local testing).
 */
export async function assertPublicRtmpTarget(rawUrl: string, allowPrivate = false): Promise<StreamTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidStreamTargetError('Streaming target is not a valid URL');
  }

  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'rtmp' && protocol !== 'rtmps') {
    throw new InvalidStreamTargetError('Only rtmp:// and rtmps:// streaming targets are allowed');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new InvalidStreamTargetError('Streaming target has no host');
  }

  const defaultPort = protocol === 'rtmps' ? 443 : 1935;
  const port = parsed.port ? Number(parsed.port) : defaultPort;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new InvalidStreamTargetError('Streaming target has an invalid port');
  }

  if (!allowPrivate) {
    if (isInternalHostname(host)) {
      throw new InvalidStreamTargetError(`Streaming to internal host "${host}" is blocked`);
    }
    if (isPrivateAddress(host)) {
      throw new InvalidStreamTargetError('Streaming to a private/loopback IP address is blocked');
    }
    let resolved: { address: string }[];
    try {
      resolved = await dnsLookup(host, { all: true, verbatim: true });
    } catch {
      throw new InvalidStreamTargetError(`Cannot resolve streaming host "${host}"`);
    }
    if (resolved.length === 0) {
      throw new InvalidStreamTargetError(`Cannot resolve streaming host "${host}"`);
    }
    for (const entry of resolved) {
      if (isPrivateAddress(entry.address)) {
        throw new InvalidStreamTargetError(
          `Streaming host "${host}" resolves to a private address (${entry.address}) which is blocked`,
        );
      }
    }
  }

  return { url: rawUrl, protocol, host, port };
}
