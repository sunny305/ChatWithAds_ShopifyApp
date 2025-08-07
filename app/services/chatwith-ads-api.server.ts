/**
 * ChatWith Ads API Service
 * Handles data synchronization between Shopify and the ChatWith Ads platform
 */

interface ChatWithAdsConfig {
  apiUrl: string;
  apiKey: string;
}

interface ShopifyDataPayload {
  shopDomain: string;
  connectorId?: string;
  analytics: any;
  orders: any[];
  customers: any[];
  products: any[];
  collections: any[];
  shop: any;
  syncTimestamp: string;
}

interface SyncResponse {
  success: boolean;
  syncId?: string;
  error?: string;
}

class ChatWithAdsAPI {
  private config: ChatWithAdsConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.CHATWITH_ADS_API_URL || '',
      apiKey: process.env.CHATWITH_ADS_API_KEY || '',
    };
  }

  /**
   * Sync Shopify data to ChatWith Ads platform
   */
  async syncShopifyData(shopDomain: string, data: Omit<ShopifyDataPayload, 'shopDomain' | 'syncTimestamp'>, connectorId?: string): Promise<SyncResponse> {
    try {
      if (!this.config.apiUrl || !this.config.apiKey) {
        console.log('ChatWith Ads API not configured - data sync skipped');
        return { success: false, error: 'API not configured' };
      }

      const payload: ShopifyDataPayload = {
        shopDomain,
        connectorId,
        ...data,
        syncTimestamp: new Date().toISOString(),
      };

      const response = await fetch(`${this.config.apiUrl}/shopify/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Source': 'shopify-connector',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Successfully synced data for ${shopDomain} - Sync ID: ${result.syncId}`);
      
      return {
        success: true,
        syncId: result.syncId,
      };
    } catch (error) {
      console.error('Failed to sync data to ChatWith Ads:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Notify ChatWith Ads of shop uninstall
   */
  async notifyUninstall(shopDomain: string): Promise<SyncResponse> {
    try {
      if (!this.config.apiUrl || !this.config.apiKey) {
        return { success: false, error: 'API not configured' };
      }

      const response = await fetch(`${this.config.apiUrl}/shopify/uninstall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          shopDomain,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Uninstall notification failed: ${response.status}`);
      }

      console.log(`Successfully notified uninstall for ${shopDomain}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to notify uninstall:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test connection to ChatWith Ads API
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      if (!this.config.apiUrl || !this.config.apiKey) {
        return { connected: false, error: 'API credentials not configured' };
      }

      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: 5000, // 5 second timeout
      });

      return { connected: response.ok };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }
}

export const chatWithAdsAPI = new ChatWithAdsAPI();
