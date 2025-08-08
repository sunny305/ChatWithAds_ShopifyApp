import crypto from "node:crypto";
import prisma from "../db.server";

export interface ComplianceWebhookPayload {
  shop_id: number;
  shop_domain: string;
  orders_requested?: string[];
  customer?: {
    id: number;
    email: string;
    phone?: string;
  };
  data_request?: {
    id: number;
  };
}

export interface ComplianceWebhookConfig {
  endpoint: string;
  secret: string;
  events: string[];
  mandatory: boolean;
}

export class ComplianceWebhookManager {
  private static readonly MANDATORY_WEBHOOKS = [
    'customers/data_request',
    'customers/redact',
    'shop/redact'
  ];

  private static readonly WEBHOOK_CONFIGS = new Map<string, ComplianceWebhookConfig>([
    ['customers/data_request', {
      endpoint: '/webhooks/compliance/customers/data_request',
      secret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
      events: ['customers/data_request'],
      mandatory: true
    }],
    ['customers/redact', {
      endpoint: '/webhooks/compliance/customers/redact',
      secret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
      events: ['customers/redact'],
      mandatory: true
    }],
    ['shop/redact', {
      endpoint: '/webhooks/compliance/shop/redact',
      secret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
      events: ['shop/redact'],
      mandatory: true
    }]
  ]);

  static verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    if (!signature || !secret) {
      console.error('Missing signature or secret for webhook verification');
      return false;
    }

    console.log('HMAC verification debug:', {
      hasBody: !!body,
      bodyLength: body.length,
      signature: signature,
      hasSecret: !!secret
    });

    // Remove sha256= prefix if present
    const cleanSignature = signature.replace('sha256=', '');
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body, 'utf8');
    const computedSignature = hmac.digest('base64');
    
    console.log('HMAC comparison:', {
      received: cleanSignature,
      computed: computedSignature,
      match: cleanSignature === computedSignature
    });
    
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature),
      Buffer.from(computedSignature)
    );
  }

  static async handleCustomerDataRequest(payload: ComplianceWebhookPayload): Promise<any> {
    console.log(`Processing customer data request for shop: ${payload.shop_domain}`);
    
    if (!payload.customer) {
      throw new Error('Customer data missing from request');
    }

    const customerData = await prisma.session.findMany({
      where: {
        shop: payload.shop_domain,
      },
      select: {
        id: true,
        shop: true,
        userId: true,
        expires: true,
        isOnline: true,
        scope: true,
      }
    });

    const response = {
      customer: {
        id: payload.customer.id,
        email: payload.customer.email,
        phone: payload.customer.phone || null,
      },
      sessions: customerData,
      shop_domain: payload.shop_domain,
      requested_at: new Date().toISOString(),
    };

    await this.logComplianceEvent('customers/data_request', payload.shop_domain, response);
    
    return response;
  }

  static async handleCustomerRedact(payload: ComplianceWebhookPayload): Promise<void> {
    console.log(`Processing customer redaction for shop: ${payload.shop_domain}`);
    
    if (!payload.customer) {
      throw new Error('Customer data missing from redaction request');
    }

    const deletedSessions = await prisma.session.deleteMany({
      where: {
        shop: payload.shop_domain,
        userId: payload.customer.id.toString(),
      }
    });

    await this.logComplianceEvent('customers/redact', payload.shop_domain, {
      customer_id: payload.customer.id,
      deleted_sessions: deletedSessions.count,
      redacted_at: new Date().toISOString(),
    });

    console.log(`Redacted ${deletedSessions.count} sessions for customer ${payload.customer.id}`);
  }

  static async handleShopRedact(payload: ComplianceWebhookPayload): Promise<void> {
    console.log(`Processing shop redaction for shop: ${payload.shop_domain}`);

    const deletedSessions = await prisma.session.deleteMany({
      where: {
        shop: payload.shop_domain,
      }
    });

    await this.logComplianceEvent('shop/redact', payload.shop_domain, {
      shop_domain: payload.shop_domain,
      deleted_sessions: deletedSessions.count,
      redacted_at: new Date().toISOString(),
    });

    console.log(`Redacted all data for shop ${payload.shop_domain}. Deleted ${deletedSessions.count} sessions.`);
  }

  private static async logComplianceEvent(event: string, shop: string, data: any): Promise<void> {
    console.log(`Compliance event logged: ${event} for ${shop}`, {
      timestamp: new Date().toISOString(),
      event,
      shop,
      data: JSON.stringify(data, null, 2)
    });
  }

  static getMandatoryWebhooks(): string[] {
    return [...this.MANDATORY_WEBHOOKS];
  }

  static getWebhookConfig(topic: string): ComplianceWebhookConfig | undefined {
    return this.WEBHOOK_CONFIGS.get(topic);
  }

  static validateMandatoryWebhooks(registeredTopics: string[]): { valid: boolean; missing: string[] } {
    const missing = this.MANDATORY_WEBHOOKS.filter(topic => !registeredTopics.includes(topic));
    return {
      valid: missing.length === 0,
      missing
    };
  }
}