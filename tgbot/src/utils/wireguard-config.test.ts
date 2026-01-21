import { isLikelyWireGuardClientConfig, normalizeWireGuardClientConfig } from './wireguard-config';

describe('wireguard-config', () => {
  test('detects client config', () => {
    const cfg = '[Interface]\nPrivateKey = x\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = y\nAllowedIPs = 0.0.0.0/0\n';
    expect(isLikelyWireGuardClientConfig(cfg)).toBe(true);
  });

  test('rejects server-like config', () => {
    const cfg = '[Interface]\nPrivateKey = x\nListenPort = 51820\nPostUp = echo 1\n';
    expect(isLikelyWireGuardClientConfig(cfg)).toBe(false);
  });

  test('injects Endpoint when missing', () => {
    const cfg = '[Interface]\nPrivateKey = x\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = y\nAllowedIPs = 0.0.0.0/0\n';
    const out = normalizeWireGuardClientConfig(cfg, { endpoint: 'vpn.example.com:51820' });
    expect(out).toContain('Endpoint = vpn.example.com:51820');
  });
});

