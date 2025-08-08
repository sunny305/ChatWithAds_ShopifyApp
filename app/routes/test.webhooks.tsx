import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { WebhookTester } from "../utils/webhook-test.server";
import { WebhookRegistry } from "../services/webhook-registry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const testResults = {
    hmacVerification: WebhookTester.testHMACVerification(),
    mandatoryValidation: WebhookTester.testMandatoryWebhookValidation(),
    complianceHandlers: await WebhookTester.testComplianceHandlers(),
    webhookConfiguration: await WebhookRegistry.validateWebhookConfiguration()
  };

  const overallSuccess = testResults.hmacVerification.success &&
                        testResults.mandatoryValidation.success &&
                        testResults.complianceHandlers.success &&
                        testResults.webhookConfiguration.valid;

  return json({
    success: overallSuccess,
    timestamp: new Date().toISOString(),
    shop: session.shop,
    results: testResults
  });
};