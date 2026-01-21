import axios from 'axios';
import { WireGuardPeer } from '../types';
import logger from '../utils/logger';

export class WGDashboardService {
  private client: any;
  private configName: string;

  constructor(baseUrl: string, apiKey: string, configName: string) {
    this.client = (axios as any).create({
      baseURL: baseUrl?.trim?.() ? baseUrl.trim() : baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'wg-dashboard-apikey': apiKey?.trim?.() ? apiKey.trim() : apiKey
      },
      timeout: 30000
    });
    this.configName = configName?.trim?.() ? configName.trim() : configName;
    
    logger.info('WGDashboard service initialized', { baseUrl, configName });
  }

  private getEnvValue(key: string): string | undefined {
    const env = (globalThis as any).process?.env;
    return typeof env?.[key] === 'string' ? env[key] : undefined;
  }

  private extractPeersFromResponse(data: any): any[] | null {
    if (!data) return null;
    if (data?.status === true && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.peers)) return data.peers;
    if (Array.isArray(data?.data?.peers)) return data.data.peers;
    return null;
  }

  private extractCreatedPeerFromResponse(data: any, fallbackName: string): WireGuardPeer | null {
    if (!data || data?.status !== true) return null;

    const candidate =
      data?.data && typeof data.data === 'object' ? data.data :
      data?.peer && typeof data.peer === 'object' ? data.peer :
      null;

    if (!candidate) return null;

    const id =
      candidate.id ??
      candidate.peerId ??
      candidate.peer_id ??
      candidate.publicKey ??
      candidate.public_key ??
      candidate.PublicKey;

    if (!id) return null;

    const name = candidate.name ?? fallbackName;

    const publicKey =
      candidate.publicKey ??
      candidate.public_key ??
      candidate.PublicKey ??
      '';

    const allowedIPs =
      candidate.allowedIPs ??
      candidate.allowed_ips ??
      candidate.AllowedIPs ??
      [];

    const config = candidate.config ?? candidate.peerConfig ?? candidate.peer_config ?? '';

    return {
      id: String(id),
      name: String(name),
      publicKey: String(publicKey),
      allowedIPs: Array.isArray(allowedIPs) ? allowedIPs.map((v: any) => String(v)) : [],
      config: String(config)
    };
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

  async restartInterface(): Promise<boolean> {
    try {
      // Пытаемся перезапустить интерфейс через API
      // В WGDashboard v4.3.0 для этого используется restartWireguardConfiguration
      const response = await this.client.post(
        `/api/restartWireguardConfiguration/${encodeURIComponent(this.configName)}`
      );
      
      if (response.data?.status === true) {
        logger.info('Interface restarted successfully');
        return true;
      }
      
      logger.warn('Failed to restart interface', { response: response.data });
      return false;
    } catch (error: any) {
      // Игнорируем 404, так как это может означать отсутствие эндпоинта
      // (в старых версиях может не быть)
      if (error.response?.status !== 404) {
        logger.error('Error restarting interface', { error: error.message });
      }
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
      const dns = options.dns || (this.getEnvValue('WG_DNS') || '1.1.1.1');
      const endpointAllowedIp = options.endpointAllowedIp || (this.getEnvValue('WG_ALLOWED_IPS') || '0.0.0.0/0');
      const keepalive = options.keepalive || parseInt((this.getEnvValue('WG_KEEPALIVE') || '21'), 10);
      const mtu = options.mtu || parseInt((this.getEnvValue('WG_MTU') || '1420'), 10);

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

      logger.debug('addPeer response', { data: response.data });

      if (response.data?.status === true) {
        // Restart interface to apply changes
        await this.restartInterface();

        const createdPeer = this.extractCreatedPeerFromResponse(response.data, payload.name);
        if (createdPeer) {
          logger.info('Peer created successfully', { peerId: createdPeer.id });
          return createdPeer;
        }

        logger.info('Peer created successfully, fetching list...');
        const peers = await this.getPeers();
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
    const candidates: Array<{ method: 'get' | 'post'; url: string; data?: any }> = [
      { method: 'get', url: `/api/getPeers/${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?configName=${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?configuration=${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?config=${encodeURIComponent(this.configName)}` },
      { method: 'post', url: `/api/getPeers`, data: { configName: this.configName } },
      { method: 'post', url: `/api/getPeers`, data: { configuration: this.configName } },
      { method: 'get', url: `/api/getWireguardConfiguration/${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getWireguardConfigurations/${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getWireguardConfigurations` }
    ];

    for (const candidate of candidates) {
      try {
        const response =
          candidate.method === 'get'
            ? await this.client.get(candidate.url)
            : await this.client.post(candidate.url, candidate.data);

        const peers = this.extractPeersFromResponse(response.data);
        if (peers) {
          return peers as any;
        }
      } catch (error: any) {
        const status = error?.response?.status || error?.status;
        if (status === 404) continue;
        logger.error('Error fetching peers', { error: error.message, candidate });
      }
    }

    return [];
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
    const urls = [
      `/api/downloadPeer/${encodeURIComponent(this.configName)}/${encodeURIComponent(peerId)}`,
      `/api/downloadPeer/${encodeURIComponent(peerId)}`,
      `/api/download/${encodeURIComponent(peerId)}`
    ];

    for (const url of urls) {
      try {
        const response = await this.client.get(url);

        if (response.data) {
          return typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
        }
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) continue;
        logger.error('Error downloading peer config', { error, peerId, url });
        return null;
      }
    }

    return null;
  }

  async deletePeer(peerId: string): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/api/deletePeers/${encodeURIComponent(this.configName)}`,
        { peers: [peerId] }
      );

      if (response.data?.status === true) {
        await this.restartInterface();
        return true;
      }
      return false;
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

      if (response.data?.status === true) {
        await this.restartInterface();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error restricting peer', { error, peerId, restrict });
      return false;
    }
  }
}
