import axios, { AxiosInstance } from 'axios';
import { WireGuardPeer } from '../types';
import logger from '../utils/logger';

export class WGDashboardService {
  private client: AxiosInstance;
  private configName: string;

  constructor(baseUrl: string, apiKey: string, configName: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'wg-dashboard-apikey': apiKey
      },
      timeout: 30000
    });
    this.configName = configName;
    
    logger.info('WGDashboard service initialized', { baseUrl, configName });
  }

  async handshake(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/handshake');
      return response.data?.status === true;
    } catch (error) {
      logger.error('WGDashboard handshake failed', { error });
      return false;
    }
  }

  async addPeer(options: {
    name?: string;
    dns?: string;
    endpointAllowedIp?: string;
    keepalive?: number;
    mtu?: number;
    presharedKey?: boolean;
  }): Promise<WireGuardPeer | null> {
    try {
      const dns = options.dns || (process.env.WG_DNS ? process.env.WG_DNS : '1.1.1.1');
      const endpointAllowedIp = options.endpointAllowedIp || (process.env.WG_ALLOWED_IPS ? process.env.WG_ALLOWED_IPS : '0.0.0.0/0');
      const keepalive = options.keepalive || parseInt((process.env.WG_KEEPALIVE ? process.env.WG_KEEPALIVE : '21'), 10);
      const mtu = options.mtu || parseInt((process.env.WG_MTU ? process.env.WG_MTU : '1420'), 10);

      const payload = {
        bulkAdd: false,
        name: options.name || `User_${Date.now()}`,
        DNS: dns,
        endpoint_allowed_ip: endpointAllowedIp,
        keepalive,
        mtu,
        preshared_key_bulkAdd: options.presharedKey || false
      };

      logger.info('Creating new peer', { payload });

      const response = await this.client.post(
        `/api/addPeers/${encodeURIComponent(this.configName)}`,
        payload
      );

      if (response.data?.status === true) {
        logger.info('Peer created successfully');
        // Получаем информацию о созданном пире
        const peers = await this.getPeers();
        // Возвращаем последний созданный пир
        return peers[peers.length - 1] || null;
      }

      logger.error('Failed to create peer', { response: response.data });
      return null;
    } catch (error: any) {
      logger.error('Error creating peer', { 
        error: error.message,
        response: error.response?.data 
      });
      return null;
    }
  }

  async getPeers(): Promise<WireGuardPeer[]> {
    try {
      const response = await this.client.get(
        `/api/getPeers/${encodeURIComponent(this.configName)}`
      );

      if (response.data?.status === true && Array.isArray(response.data.data)) {
        return response.data.data;
      }

      return [];
    } catch (error) {
      logger.error('Error fetching peers', { error });
      return [];
    }
  }

  async getPeerById(peerId: string): Promise<WireGuardPeer | null> {
    try {
      const peers = await this.getPeers();
      return peers.find(p => p.id === peerId) || null;
    } catch (error) {
      logger.error('Error fetching peer by ID', { error, peerId });
      return null;
    }
  }

  async downloadPeerConfig(peerId: string): Promise<string | null> {
    try {
      const response = await this.client.get(
        `/api/downloadPeer/${encodeURIComponent(this.configName)}/${encodeURIComponent(peerId)}`
      );

      if (response.data) {
        return typeof response.data === 'string' 
          ? response.data 
          : JSON.stringify(response.data);
      }

      return null;
    } catch (error) {
      logger.error('Error downloading peer config', { error, peerId });
      return null;
    }
  }

  async deletePeer(peerId: string): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/api/deletePeers/${encodeURIComponent(this.configName)}`,
        { peers: [peerId] }
      );

      return response.data?.status === true;
    } catch (error) {
      logger.error('Error deleting peer', { error, peerId });
      return false;
    }
  }

  async restrictPeer(peerId: string, restrict: boolean): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/api/restrictPeers/${encodeURIComponent(this.configName)}`,
        { peers: [peerId], restrict }
      );

      return response.data?.status === true;
    } catch (error) {
      logger.error('Error restricting peer', { error, peerId, restrict });
      return false;
    }
  }
}
