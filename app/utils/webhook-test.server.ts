import crypto from "node:crypto";
import { ComplianceWebhookManager, type ComplianceWebhookPayload } from "../services/compliance-webhooks.server";

export class WebhookTester {
  private static createTestSignature(body: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body, 'utf8');
    return `sha256=${hmac.digest('base64')}`;
  }

  static testHMACVerification(): { success: boolean; details: any } {
    const testSecret = "test-webhook-secret";
    const testBody = '{"test": "data"}';
    
    const validSignature = this.createTestSignature(testBody, testSecret);
    const invalidSignature = "sha256=invalid-signature";

    const validResult = ComplianceWebhookManager.verifyWebhookSignature(testBody, validSignature, testSecret);
    const invalidResult = ComplianceWebhookManager.verifyWebhookSignature(testBody, invalidSignature, testSecret);

    return {
      success: validResult && !invalidResult,
      details: {
        validSignatureTest: validResult,
        invalidSignatureTest: invalidResult,
        testSignature: validSignature
      }
    };
  }

  static createTestPayload(type: 'data_request' | 'customer_redact' | 'shop_redact'): ComplianceWebhookPayload {
    const basePayload = {
      shop_id: 12345,
      shop_domain: 'test-shop.myshopify.com'
    };

    switch (type) {
      case 'data_request':
        return {
          ...basePayload,
          customer: {
            id: 67890,
            email: 'customer@example.com',
            phone: '+1234567890'
          },
          data_request: {
            id: 1001
          }
        };
      
      case 'customer_redact':
        return {
          ...basePayload,
          customer: {
            id: 67890,
            email: 'customer@example.com'
          }
        };
      
      case 'shop_redact':
        return basePayload;
    }
  }

  static async testComplianceHandlers(): Promise<{ success: boolean; results: any }> {
    const results = {
      dataRequest: { success: false, error: null as any },
      customerRedact: { success: false, error: null as any },
      shopRedact: { success: false, error: null as any }
    };

    try {
      const dataRequestPayload = this.createTestPayload('data_request');
      const dataResult = await ComplianceWebhookManager.handleCustomerDataRequest(dataRequestPayload);
      results.dataRequest.success = !!dataResult;
    } catch (error) {
      results.dataRequest.error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      const customerRedactPayload = this.createTestPayload('customer_redact');
      await ComplianceWebhookManager.handleCustomerRedact(customerRedactPayload);
      results.customerRedact.success = true;
    } catch (error) {
      results.customerRedact.error = error instanceof Error ? error.message : 'Unknown error';
    }

    try {
      const shopRedactPayload = this.createTestPayload('shop_redact');
      await ComplianceWebhookManager.handleShopRedact(shopRedactPayload);
      results.shopRedact.success = true;
    } catch (error) {
      results.shopRedact.error = error instanceof Error ? error.message : 'Unknown error';
    }

    const overallSuccess = results.dataRequest.success && 
                          results.customerRedact.success && 
                          results.shopRedact.success;

    return { success: overallSuccess, results };
  }

  static testMandatoryWebhookValidation(): { success: boolean; details: any } {
    const allWebhooks = ['app/uninstalled', 'customers/data_request', 'customers/redact', 'shop/redact'];
    const partialWebhooks = ['app/uninstalled', 'customers/data_request'];
    
    const completeValidation = ComplianceWebhookManager.validateMandatoryWebhooks(allWebhooks);
    const incompleteValidation = ComplianceWebhookManager.validateMandatoryWebhooks(partialWebhooks);

    return {
      success: completeValidation.valid && !incompleteValidation.valid,
      details: {
        completeValidation,
        incompleteValidation,
        mandatoryWebhooks: ComplianceWebhookManager.getMandatoryWebhooks()
      }
    };
  }
}