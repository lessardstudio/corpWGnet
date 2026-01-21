import { ConfigHandler } from './config.handler';
import { WGDashboardService } from '../services/wgdashboard.service';
import { ServiceManagerClient } from '../services/manager.service';
import { QRCodeGenerator } from '../utils/qrcode';
import { AuthService } from '../services/auth.service';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ConfigHandler', () => {
  let handler: ConfigHandler;
  let wgService: jest.Mocked<WGDashboardService>;
  let managerService: jest.Mocked<ServiceManagerClient>;
  let qrGenerator: jest.Mocked<QRCodeGenerator>;
  let authService: jest.Mocked<AuthService>;
  let ctx: any;

  beforeEach(() => {
    wgService = {
      addPeer: jest.fn(),
      downloadPeerConfig: jest.fn()
    } as any;

    managerService = {
      createShareLink: jest.fn()
    } as any;

    qrGenerator = {
      generateQRCode: jest.fn()
    } as any;

    authService = {
      canGetConfig: jest.fn()
    } as any;

    handler = new ConfigHandler(wgService, managerService, qrGenerator, authService);

    ctx = {
      from: { id: 491, username: 'u1', first_name: 'U' },
      chat: { id: 100 },
      reply: jest.fn().mockResolvedValue({ message_id: 10 }),
      replyWithPhoto: jest.fn(),
      replyWithDocument: jest.fn(),
      api: {
        editMessageText: jest.fn(),
        deleteMessage: jest.fn()
      }
    };
  });

  it('uses peer.config without calling downloadPeerConfig when present', async () => {
    authService.canGetConfig.mockReturnValue(true);
    (globalThis as any).process = (globalThis as any).process || {};
    (globalThis as any).process.env = { ...(globalThis as any).process.env, WG_ENDPOINT: 'vpn.example.com:51820' };

    wgService.addPeer.mockResolvedValue({
      id: 'pk1',
      name: 'n1',
      publicKey: 'pk1',
      allowedIPs: [],
      config: '[Interface]\nPrivateKey = x\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = y\nAllowedIPs = 0.0.0.0/0\n'
    } as any);

    managerService.createShareLink.mockResolvedValue({ id: 'l1', url: 'http://x' } as any);
    qrGenerator.generateQRCode.mockResolvedValue(Buffer.from('qr'));

    await handler.handleGetConfig(ctx);

    expect(wgService.downloadPeerConfig).not.toHaveBeenCalled();
    expect(managerService.createShareLink).toHaveBeenCalledWith(
      'pk1',
      expect.objectContaining({ config: expect.stringContaining('Endpoint = vpn.example.com:51820') })
    );
    expect(ctx.replyWithDocument).toHaveBeenCalled();
  });

  it('calls downloadPeerConfig when peer.config is missing', async () => {
    authService.canGetConfig.mockReturnValue(true);
    (globalThis as any).process = (globalThis as any).process || {};
    (globalThis as any).process.env = { ...(globalThis as any).process.env, WG_ENDPOINT: 'vpn.example.com:51820' };

    wgService.addPeer.mockResolvedValue({
      id: 'pk2',
      name: 'n2',
      publicKey: 'pk2',
      allowedIPs: [],
      config: ''
    } as any);

    wgService.downloadPeerConfig.mockResolvedValue('[Interface]\nPrivateKey = y\nAddress = 10.0.0.3/32\n\n[Peer]\nPublicKey = z\nAllowedIPs = 0.0.0.0/0\n');
    managerService.createShareLink.mockResolvedValue({ id: 'l2', url: 'http://y' } as any);
    qrGenerator.generateQRCode.mockResolvedValue(Buffer.from('qr'));

    await handler.handleGetConfig(ctx);

    expect(wgService.downloadPeerConfig).toHaveBeenCalledWith('pk2');
    expect(ctx.replyWithDocument).toHaveBeenCalled();
  });

  it('rejects server-like config', async () => {
    authService.canGetConfig.mockReturnValue(true);

    wgService.addPeer.mockResolvedValue({
      id: 'pk3',
      name: 'n3',
      publicKey: 'pk3',
      allowedIPs: [],
      config: '[Interface]\nPrivateKey = x\nListenPort = 51820\n'
    } as any);

    await handler.handleGetConfig(ctx);

    expect(managerService.createShareLink).not.toHaveBeenCalled();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(
      100,
      10,
      '❌ Получен некорректный файл конфигурации. Попробуйте позже.'
    );
  });
});
