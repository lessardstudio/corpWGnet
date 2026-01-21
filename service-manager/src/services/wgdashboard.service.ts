import axios, { AxiosInstance } from 'axios';

export interface WireGuardPeer {
  id: string;
  name: string;
  publicKey: string;
  allowedIPs: string[];
  endpoint?: string;
  persistentKeepalive?: number;
}

export class WGDashboardClient {
  private client: AxiosInstance;
  private configName: string;

  constructor(baseUrl: string, apiKey: string, configName: string) {
    this.client = axios.create({
      baseURL: baseUrl?.trim?.() ? baseUrl.trim() : baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'wg-dashboard-apikey': apiKey?.trim?.() ? apiKey.trim() : apiKey
      },
      timeout: 30000
    });
    this.configName = configName?.trim?.() ? configName.trim() : configName;
  }

  private extractPeersFromResponse(data: any): any[] | null {
    if (!data) return null;
    if (data?.status === true && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.peers)) return data.peers;
    if (Array.isArray(data?.data?.peers)) return data.data.peers;
    return null;
  }

  private async getPeersRaw(): Promise<any[]> {
    const candidates: Array<{ method: 'get' | 'post'; url: string; data?: any }> = [
      { method: 'get', url: `/api/getPeers/${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?configName=${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?configuration=${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getPeers?config=${encodeURIComponent(this.configName)}` },
      { method: 'post', url: `/api/getPeers`, data: { configName: this.configName } },
      { method: 'post', url: `/api/getPeers`, data: { configuration: this.configName } },
      { method: 'get', url: `/api/getWireguardConfiguration/${encodeURIComponent(this.configName)}` },
      { method: 'get', url: `/api/getWireguardConfigurations/${encodeURIComponent(this.configName)}` }
    ];

    for (const candidate of candidates) {
      try {
        const response =
          candidate.method === 'get'
            ? await this.client.get(candidate.url)
            : await this.client.post(candidate.url, candidate.data);

        const peers = this.extractPeersFromResponse(response.data);
        if (peers) return peers;
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404) continue;
        console.error('Error fetching peers:', error.message);
        return [];
      }
    }

    return [];
  }

  async getPeerConfig(peerId: string): Promise<string | null> {
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
        console.error('Error fetching peer config:', error.message);
        return null;
      }
    }

    return null;
  }

  async getPeerById(peerId: string): Promise<WireGuardPeer | null> {
    try {
      const peers = await this.getPeersRaw();
      const peer = peers.find((p: any) => p.id === peerId);
      return peer || null;
    } catch (error: any) {
      console.error('Error fetching peer:', error.message);
      return null;
    }
  }

  async restrictPeer(peerId: string, restrict: boolean): Promise<boolean> {
    try {
      const response = await this.client.post(
        `/api/restrictPeers/${encodeURIComponent(this.configName)}`,
        { peers: [peerId], restrict }
      );

      return response.data?.status === true;
    } catch (error: any) {
      console.error('Error restricting peer:', error.message);
      return false;
    }
  }
}
