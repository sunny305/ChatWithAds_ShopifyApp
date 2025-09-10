import crypto from "node:crypto";
import { ComplianceWebhookManager, type ComplianceWebhookPayload } from "../services/compliance-webhooks.server";
import { WebhookSecurity, type WebhookVerificationResult } from "./webhook-security.server";

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

    // Test new centralized WebhookSecurity class
    const validResult = WebhookSecurity.verifyHmacSignature(testBody, validSignature, testSecret);
    const invalidResult = WebhookSecurity.verifyHmacSignature(testBody, invalidSignature, testSecret);
    const missingResult = WebhookSecurity.verifyHmacSignature(testBody, null, testSecret);

    // Test old ComplianceWebhookManager for backward compatibility
    const oldValidResult = ComplianceWebhookManager.verifyWebhookSignature(testBody, validSignature, testSecret);
    const oldInvalidResult = ComplianceWebhookManager.verifyWebhookSignature(testBody, invalidSignature, testSecret);

    const newTestsPassed = validResult.valid && !invalidResult.valid && !missingResult.valid;
    const oldTestsPassed = oldValidResult && !oldInvalidResult;

    return {
      success: newTestsPassed && oldTestsPassed,
      details: {
        newWebhookSecurity: {
          validSignature: validResult,
          invalidSignature: invalidResult,
          missingSignature: missingResult
        },
        oldComplianceManager: {
          validSignature: oldValidResult,
          invalidSignature: oldInvalidResult
        },
        testSignature: validSignature,
        allTestsPassed: newTestsPassed && oldTestsPassed
      }
    };
  }

  static testWebhookSecurityUtility(): { success: boolean; details: any } {
    const testSecret = "test-webhook-secret";
    const testPayload = JSON.stringify({
      shop_domain: "test-shop.myshopify.com",
      customer: { id: 123, email: "test@example.com" }
    });

    // Create mock request
    const mockRequest = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-hmac-sha256': this.createTestSignature(testPayload, testSecret)
      },
      body: testPayload
    });

    // Test signature extraction
    const extractedSignature = WebhookSecurity.extractHmacSignature(mockRequest);
    const hasValidSignature = !!extractedSignature;

    // Test environment validation
    const envValidation = WebhookSecurity.validateEnvironment();
    const envValid = envValidation.length === 0;

    return {
      success: hasValidSignature && envValid,
      details: {
        signatureExtraction: {
          success: hasValidSignature,
          signature: extractedSignature
        },
        environmentValidation: {
          success: envValid,
          missing: envValidation
        }
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

  static async runAllTests(): Promise<{ success: boolean; results: any }> {
    console.log('🔐 Running comprehensive webhook security tests...\n');
    
    const results = {
      hmacVerification: this.testHMACVerification(),
      webhookSecurity: this.testWebhookSecurityUtility(),
      mandatoryValidation: this.testMandatoryWebhookValidation(),
      complianceHandlers: await this.testComplianceHandlers()
    };

    const allPassed = Object.values(results).every(result => result.success);

    // Log results
    Object.entries(results).forEach(([testName, result]) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${testName}: ${result.success ? 'PASSED' : 'FAILED'}`);
      if (!result.success && result.details) {
        console.log('   Details:', JSON.stringify(result.details, null, 2));
      }
    });

    console.log(`\n📊 Overall result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    return { success: allPassed, results };
  }
}

/**
 * Quick test function for manual verification in development
 */
export async function testWebhookSecurity(): Promise<void> {
  const testResult = await WebhookTester.runAllTests();
  
  if (testResult.success) {
    console.log('🎉 All webhook security features are working correctly!');
  } else {
    console.log('⚠️  Some webhook security tests failed. Please review the implementation.');
    console.log('Test results:', testResult.results);
  }
}