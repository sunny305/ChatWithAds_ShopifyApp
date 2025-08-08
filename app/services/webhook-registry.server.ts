import { registerWebhooks } from "../shopify.server";
import { ComplianceWebhookManager } from "./compliance-webhooks.server";

export interface WebhookRegistrationResult {
  success: boolean;
  registered: string[];
  failed: string[];
  compliance: {
    valid: boolean;
    missing: string[];
  };
}

export class WebhookRegistry {
  static async registerAllWebhooks(session: any): Promise<WebhookRegistrationResult> {
    const result: WebhookRegistrationResult = {
      success: false,
      registered: [],
      failed: [],
      compliance: { valid: false, missing: [] }
    };

    try {
      const webhookTopics = [
        'app/uninstalled',
        'app/scopes_update',
        'customers/data_request',
        'customers/redact',
        'shop/redact'
      ];

      const registrationResult = await registerWebhooks({ session });
      
      if (registrationResult) {
        result.registered = webhookTopics;
        result.success = true;
      }

      result.compliance = ComplianceWebhookManager.validateMandatoryWebhooks(result.registered);

      console.log('Webhook registration completed:', {
        registered: result.registered,
        failed: result.failed,
        complianceValid: result.compliance.valid,
        missingCompliance: result.compliance.missing
      });

      return result;
    } catch (error) {
      console.error('Error registering webhooks:', error);
      result.failed = ['all'];
      return result;
    }
  }

  static async validateWebhookConfiguration(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
      issues.push('SHOPIFY_WEBHOOK_SECRET environment variable is not set');
    }

    const mandatoryWebhooks = ComplianceWebhookManager.getMandatoryWebhooks();
    const webhookConfigs = mandatoryWebhooks.map(topic => ComplianceWebhookManager.getWebhookConfig(topic));
    
    webhookConfigs.forEach((config, index) => {
      if (!config) {
        issues.push(`Configuration missing for mandatory webhook: ${mandatoryWebhooks[index]}`);
      } else if (!config.secret) {
        issues.push(`Secret not configured for webhook: ${mandatoryWebhooks[index]}`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }

  static getMandatoryComplianceWebhooks(): string[] {
    return ComplianceWebhookManager.getMandatoryWebhooks();
  }
}