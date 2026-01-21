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
    if (this.isInterfaceConfigListResponse(data)) return null;
    if (data?.status === true && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.peers)) return data.peers;
    if (Array.isArray(data?.data?.peers)) return data.data.peers;
    if (Array.isArray(data?.data?.Peers)) return data.data.Peers;
    if (Array.isArray(data?.peers?.data)) return data.peers.data;
    if (Array.isArray(data?.data?.peers?.data)) return data.data.peers.data;
    return null;
  }

  private isInterfaceConfigListResponse(data: any): boolean {
    const list =
      Array.isArray(data?.data) ? data.data :
      Array.isArray(data?.data?.data) ? data.data.data :
      null;

    if (!list || list.length === 0) return false;

    return list.every((item: any) => this.isInterfaceConfig(item));
  }

  private isInterfaceConfig(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.Name !== 'string') return false;
    if ('TotalPeers' in item || 'ConnectedPeers' in item) return true;
    if ('ListenPort' in item && 'Protocol' in item && 'PublicKey' in item) return true;
    return false;
  }

  private normalizePeer(raw: any): WireGuardPeer | null {
    if (!raw || typeof raw !== 'object') return null;
    if (this.isInterfaceConfig(raw)) return null;

    const id =
      raw.id ??
      raw.peerId ??
      raw.peer_id ??
      raw.publicKey ??
      raw.public_key ??
      raw.PublicKey ??
      raw.key ??
      raw.Key;

    if (!id) return null;

    const name = raw.name ?? raw.Name ?? '';

    const publicKey =
      raw.publicKey ??
      raw.public_key ??
      raw.PublicKey ??
      '';

    const allowedIPs =
      raw.allowedIPs ??
      raw.allowed_ips ??
      raw.AllowedIPs ??
      [];

    const config = raw.config ?? raw.peerConfig ?? raw.peer_config ?? '';

    return {
      id: String(id),
      name: String(name),
      publicKey: String(publicKey),
      allowedIPs: Array.isArray(allowedIPs) ? allowedIPs.map((v: any) => String(v)) : [],
      config: String(config)
    };
  }

  private extractCreatedPeerFromResponse(data: any, fallbackName: string): WireGuardPeer | null {
    if (!data || data?.status !== true) return null;

    const base =
      Array.isArray(data?.data) ? data.data[0] :
      data?.data && typeof data.data === 'object' ? data.data :
      Array.isArray(data?.peers) ? data.peers[0] :
      data?.peer && typeof data.peer === 'object' ? data.peer :
      null;

    if (!base) return null;

    const candidate =
      Array.isArray((base as any).peers) ? (base as any).peers[0] :
      Array.isArray((base as any).data) ? (base as any).data[0] :
      base;

    const normalized = this.normalizePeer(candidate);
    if (!normalized) return null;

    return {
      ...normalized,
      name: normalized.name || String(fallbackName)
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

      logger.debug('addPeer response received', { status: response.data?.status, keys: Object.keys(response.data || {}) });

      if (response.data?.status === true) {
        // Restart interface to apply changes
        await this.restartInterface();

        const createdPeer = this.extractCreatedPeerFromResponse(response.data, payload.name);
        if (createdPeer) {
          logger.info('Peer created successfully', { peerId: createdPeer.id });
          return createdPeer;
        }

        logger.warn('Peer created but id not found in response, falling back to peer list', { configName: this.configName });
        logger.info('Peer created successfully, fetching list...');
        const peers = await this.getPeers();
        const byName = peers.find(p => p.name === payload.name);
        return byName || peers[peers.length - 1] || null;
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
      { method: 'get', url: `/api/getWireguardConfigurationInformation/${encodeURIComponent(this.configName)}` }
    ];

    for (const candidate of candidates) {
      try {
        const response =
          candidate.method === 'get'
            ? await this.client.get(candidate.url)
            : await this.client.post(candidate.url, candidate.data);

        const peers = this.extractPeersFromResponse(response.data);
        if (peers) {
          const normalized = (peers as any[])
            .map((p) => this.normalizePeer(p))
            .filter((p): p is WireGuardPeer => !!p);

          if (normalized.length > 0) {
            logger.debug('Peers fetched successfully', { candidate });
            return normalized;
          }
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
    if (!peerId || peerId === 'undefined' || peerId === 'null') {
      logger.error('All config download attempts failed', { peerId });
      return null;
    }

    const encodedPeerId = encodeURIComponent(peerId);
    const doublyEncodedPeerId = encodeURIComponent(encodedPeerId);

    const peerIdVariants = Array.from(new Set([encodedPeerId, doublyEncodedPeerId]));

    const attemptResults: Array<{ url: string; status?: number; bodySnippet?: string }> = [];

    const buildUrls = (variant: string) => ([
      `/api/downloadPeer/${encodeURIComponent(this.configName)}/${variant}`,
      `/api/downloadPeer/${variant}`,
      `/api/download/${variant}`,
      `/api/downloadPeer/${encodeURIComponent(this.configName)}?peerId=${variant}`,
      `/api/downloadPeer/${encodeURIComponent(this.configName)}?peerID=${variant}`,
      `/api/downloadPeers/${encodeURIComponent(this.configName)}`
    ]);

    for (let attempt = 0; attempt < 3; attempt++) {
      for (const variant of peerIdVariants) {
        const urls = buildUrls(variant);

        for (const url of urls) {
          try {
            const response = await this.client.get(url, { responseType: 'text' });

            const data = response.data;
            if (!data) {
              attemptResults.push({ url, status: response.status });
              continue;
            }

            if (typeof data === 'string' && data.trim().startsWith('{')) {
              try {
                const json = JSON.parse(data);
                if (json?.status === false) {
                  attemptResults.push({ url, status: response.status, bodySnippet: JSON.stringify(json).slice(0, 200) });
                  continue;
                }
              } catch {
              }
            }

            logger.info('Config downloaded successfully', { url });
            return typeof data === 'string' ? data : JSON.stringify(data);
          } catch (error: any) {
            const status = error?.response?.status ?? error?.status;
            const body = error?.response?.data;
            const bodySnippet =
              typeof body === 'string'
                ? body.slice(0, 200)
                : body && typeof body === 'object'
                  ? JSON.stringify(body).slice(0, 200)
                  : undefined;

            attemptResults.push({ url, status, bodySnippet });
            if (status === 404) continue;
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    logger.error('All config download attempts failed', { peerId, attempts: attemptResults });

    try {
      const peer = await this.getPeerById(peerId);
      const configText = peer?.config;
      if (typeof configText === 'string' && configText.includes('[Interface]')) {
        logger.info('Config resolved from peers list fallback', { peerId });
        return configText;
      }
    } catch (error: any) {
      logger.error('Peers list fallback failed', { peerId, error: error.message });
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
