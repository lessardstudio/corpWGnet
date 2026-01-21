import axios, { AxiosInstance } from 'axios';
import { ShareLink } from '../types';
import logger from '../utils/logger';

export class ServiceManagerClient {
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    logger.info('ServiceManager client initialized', { baseUrl });
  }

  async createShareLink(
    peerId: string, 
    options: {
      expiryHours?: number;
      maxUsage?: number;
    } = {}
  ): Promise<ShareLink | null> {
    try {
      const response = await this.client.post('/api/links', {
        peerId,
        expiryHours: options.expiryHours || 24,
        maxUsage: options.maxUsage || 1
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error creating share link', { 
        error: error.message,
        response: error.response?.data 
      });
      return null;
    }
  }

  async getShareLink(linkId: string): Promise<ShareLink | null> {
    try {
      const response = await this.client.get(`/api/links/${linkId}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching share link', { error, linkId });
      return null;
    }
  }

  async deactivateLink(linkId: string): Promise<boolean> {
    try {
      const response = await this.client.delete(`/api/links/${linkId}`);
      return response.status === 200;
    } catch (error) {
      logger.error('Error deactivating link', { error, linkId });
      return false;
    }
  }

  async getActiveLinks(userId?: number): Promise<ShareLink[]> {
    try {
      const params = userId ? { userId } : {};
      const response = await this.client.get('/api/links', { params });
      return response.data || [];
    } catch (error) {
      logger.error('Error fetching active links', { error });
      return [];
    }
  }
}
