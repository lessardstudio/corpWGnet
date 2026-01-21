jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn()
  }
}));

import axios from 'axios';
import { WGDashboardService } from './wgdashboard.service';

describe('WGDashboardService', () => {
  test('getPeers returns peers from first successful endpoint', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn()
    };

    (axios as any).create.mockReturnValue(client);

    client.get.mockRejectedValueOnce({ response: { status: 404 } });
    client.get.mockResolvedValueOnce({ data: { status: true, data: [{ id: 'p1' }] } });

    const svc = new WGDashboardService('http://wgdashboard:10086', 'k', 'wg0');
    const peers = await svc.getPeers();

    expect(Array.isArray(peers)).toBe(true);
    expect((peers as any)[0].id).toBe('p1');
    expect(client.get).toHaveBeenCalled();
  });

  test('downloadPeerConfig falls back across endpoints', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn()
    };

    (axios as any).create.mockReturnValue(client);

    client.get.mockRejectedValueOnce({ response: { status: 404 } });
    client.get.mockResolvedValueOnce({ data: '[Interface]\nPrivateKey = x\n' });

    const svc = new WGDashboardService('http://wgdashboard:10086', 'k', 'wg0');
    const conf = await svc.downloadPeerConfig('peer-1');

    expect(conf).toContain('[Interface]');
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  test('addPeer returns created peer from response without calling getPeers', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn()
    };

    (axios as any).create.mockReturnValue(client);

    client.post.mockResolvedValueOnce({
      data: {
        status: true,
        data: { id: 'peer-123', name: 'n1', public_key: 'pk', allowed_ips: ['10.0.0.2/32'] }
      }
    });

    const svc = new WGDashboardService('http://wgdashboard:10086', 'k', 'wg0');
    const getPeersSpy = jest.spyOn(svc as any, 'getPeers');

    const peer = await svc.addPeer({ name: 'n1' });

    expect(peer?.id).toBe('peer-123');
    expect(getPeersSpy).not.toHaveBeenCalled();
  });
});

