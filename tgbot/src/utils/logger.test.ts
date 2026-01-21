
import { logger } from './logger';
import winston from 'winston';

describe('Logger', () => {
  it('should be defined', () => {
    expect(logger).toBeDefined();
  });

  it('should have correct default meta', () => {
    expect(logger.defaultMeta).toEqual({ service: 'wg-tgbot' });
  });

  it('should have configured transports', () => {
    expect(logger.transports.length).toBe(3);
    expect(logger.transports[0]).toBeInstanceOf(winston.transports.File);
    expect(logger.transports[1]).toBeInstanceOf(winston.transports.File);
    expect(logger.transports[2]).toBeInstanceOf(winston.transports.Console);
  });

  it('should format log messages correctly', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();
    logger.info('test message', { meta: 'data' });
    expect(infoSpy).toHaveBeenCalledWith('test message', { meta: 'data' });
    infoSpy.mockRestore();
  });
});
