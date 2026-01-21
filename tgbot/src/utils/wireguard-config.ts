type NormalizeOptions = {
  endpoint?: string;
  allowedIps?: string;
  dns?: string;
};

const CLIENT_REQUIRED_MARKERS = ['[Interface]', '[Peer]'] as const;

export function isLikelyWireGuardClientConfig(config: string): boolean {
  if (!config || typeof config !== 'string') return false;

  for (const marker of CLIENT_REQUIRED_MARKERS) {
    if (!config.includes(marker)) return false;
  }

  const hasInterfacePrivateKey = /\[Interface\][\s\S]*?\n\s*PrivateKey\s*=/.test(config);
  const hasPeerPublicKey = /\[Peer\][\s\S]*?\n\s*PublicKey\s*=/.test(config);

  if (!hasInterfacePrivateKey || !hasPeerPublicKey) return false;

  const looksLikeServerConfig =
    /\n\s*ListenPort\s*=/.test(config) ||
    /\n\s*PostUp\s*=/.test(config) ||
    /\n\s*PostDown\s*=/.test(config) ||
    /\n\s*SaveConfig\s*=/.test(config);

  return !looksLikeServerConfig;
}

export function normalizeWireGuardClientConfig(raw: string, options: NormalizeOptions = {}): string | null {
  const config = raw?.trim();
  if (!config) return null;
  if (!isLikelyWireGuardClientConfig(config)) return null;

  const lines = config.split(/\r?\n/);
  const normalizedLines: string[] = [];

  let inInterface = false;
  let inPeer = false;

  let hasDNS = false;
  let hasAllowedIPs = false;
  let hasEndpoint = false;

  const endpoint = options.endpoint?.trim();
  const allowedIps = options.allowedIps?.trim();
  const dns = options.dns?.trim();

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\[Interface\]\s*$/.test(trimmed)) {
      inInterface = true;
      inPeer = false;
      normalizedLines.push('[Interface]');
      continue;
    }

    if (/^\[Peer\]\s*$/.test(trimmed)) {
      inInterface = false;
      inPeer = true;
      normalizedLines.push('[Peer]');
      continue;
    }

    if (inInterface && /^\s*DNS\s*=/.test(line)) hasDNS = true;
    if (inPeer && /^\s*AllowedIPs\s*=/.test(line)) hasAllowedIPs = true;
    if (inPeer && /^\s*Endpoint\s*=/.test(line)) hasEndpoint = true;

    normalizedLines.push(line);
  }

  if (endpoint && !hasEndpoint) {
    const peerIndex = normalizedLines.findIndex((l) => /^\[Peer\]\s*$/.test(l.trim()));
    if (peerIndex !== -1) {
      normalizedLines.splice(peerIndex + 1, 0, `Endpoint = ${endpoint}`);
      hasEndpoint = true;
    }
  }

  if (allowedIps && !hasAllowedIPs) {
    const peerIndex = normalizedLines.findIndex((l) => /^\[Peer\]\s*$/.test(l.trim()));
    if (peerIndex !== -1) {
      const insertAt = hasEndpoint ? peerIndex + 2 : peerIndex + 1;
      normalizedLines.splice(insertAt, 0, `AllowedIPs = ${allowedIps}`);
    }
  }

  if (dns && !hasDNS) {
    const ifaceIndex = normalizedLines.findIndex((l) => /^\[Interface\]\s*$/.test(l.trim()));
    if (ifaceIndex !== -1) {
      normalizedLines.splice(ifaceIndex + 1, 0, `DNS = ${dns}`);
    }
  }

  return normalizedLines.join('\n').trim() + '\n';
}

