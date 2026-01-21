import QRCode from 'qrcode';
import logger from '../utils/logger';

export class QRCodeGenerator {
  async generateQRCode(config: string): Promise<Buffer | null> {
    try {
      const qrBuffer = await QRCode.toBuffer(config, {
        errorCorrectionLevel: 'M',
        type: 'png',
        width: 512,
        margin: 2
      });
      
      logger.info('QR code generated successfully');
      return qrBuffer;
    } catch (error) {
      logger.error('Error generating QR code', { error });
      return null;
    }
  }

  async generateQRDataURL(config: string): Promise<string | null> {
    try {
      const dataUrl = await QRCode.toDataURL(config, {
        errorCorrectionLevel: 'M',
        width: 512,
        margin: 2
      });
      
      return dataUrl;
    } catch (error) {
      logger.error('Error generating QR data URL', { error });
      return null;
    }
  }
}
