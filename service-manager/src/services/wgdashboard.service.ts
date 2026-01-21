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
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'wg-dashboard-apikey': apiKey
      },
      timeout: 30000
    });
    this.configName = configName;
  }

  async getPeerConfig(peerId: string): Promise<string | null> {
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
    } catch (error: any) {
      console.error('Error fetching peer config:', error.message);
      return null;
    }
  }

  async getPeerById(peerId: string): Promise<WireGuardPeer | null> {
    try {
      const response = await this.client.get(
        `/api/getWireguardConfigurations/${encodeURIComponent(this.configName)}/peers`
      );

      if (response.data?.status === true && Array.isArray(response.data.data)) {
        const peer = response.data.data.find((p: any) => p.id === peerId);
        return peer || null;
      }

      return null;
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
