import { AuthHandler } from './auth.handler';
import { AuthService } from '../services/auth.service';

// Mock logger to avoid cluttering test output
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock AuthService
jest.mock('../services/auth.service');

describe('AuthHandler', () => {
  let authHandler: AuthHandler;
  let authService: jest.Mocked<AuthService>;
  let ctx: any;

  beforeEach(() => {
    authService = new AuthService('test.db', 'admin_approval', [], []) as jest.Mocked<AuthService>;
    // Since we mocked the class, we need to mock the methods we use
    authService.canGetConfig = jest.fn();
    authService.requestAccess = jest.fn();
    authService.isAdmin = jest.fn();
    authService.getPendingRequests = jest.fn();
    authService.getAccessRequest = jest.fn();
    authService.approveUser = jest.fn();
    authService.rejectUser = jest.fn();
    authService.revokeAccess = jest.fn();
    authService.getApprovedUsers = jest.fn();
    authService.getAuthStats = jest.fn();
    (authService as any).adminIds = [12345];

    authHandler = new AuthHandler(authService);

    ctx = {
      from: {
        id: 111,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
      },
      reply: jest.fn(),
      api: {
        sendMessage: jest.fn(),
      },
    };
  });

  describe('handleRequestAccess', () => {
    it('should reply with error if userId is missing', async () => {
      ctx.from = undefined;
      await authHandler.handleRequestAccess(ctx);
      expect(ctx.reply).toHaveBeenCalledWith('❌ Не удалось определить ваш ID.');
    });

    it('should reply if user already has access', async () => {
      authService.canGetConfig.mockReturnValue(true);
      await authHandler.handleRequestAccess(ctx);
      expect(ctx.reply).toHaveBeenCalledWith('✅ У вас уже есть доступ к получению конфигураций!');
    });

    it('should handle request access success', async () => {
      authService.canGetConfig.mockReturnValue(false);
      authService.requestAccess.mockReturnValue({
        userId: 111,
        requestedAt: Date.now(),
        status: 'pending',
      });

      await authHandler.handleRequestAccess(ctx);

      expect(authService.requestAccess).toHaveBeenCalledWith(111, 'testuser', 'Test', 'User');
      expect(ctx.reply).toHaveBeenCalled();
      // Should notify admin (12345)
      expect(ctx.api.sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Новый запрос на доступ'), expect.anything());
    });
  });

  describe('handleApprove', () => {
    it('should deny if not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      await authHandler.handleApprove(ctx, 222);
      expect(ctx.reply).toHaveBeenCalledWith('⛔ Эта команда доступна только администраторам.');
    });

    it('should approve user successfully', async () => {
      authService.isAdmin.mockReturnValue(true);
      authService.getAccessRequest.mockReturnValue({
        userId: 222,
        username: 'user2',
        status: 'pending',
        requestedAt: Date.now(),
      });
      authService.approveUser.mockReturnValue(true);

      await authHandler.handleApprove(ctx, 222);

      expect(authService.approveUser).toHaveBeenCalledWith(222, 111);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Доступ одобрен'), expect.anything());
      // Should notify user
      expect(ctx.api.sendMessage).toHaveBeenCalledWith(222, expect.stringContaining('Ваш запрос одобрен'), expect.anything());
    });
  });
});
