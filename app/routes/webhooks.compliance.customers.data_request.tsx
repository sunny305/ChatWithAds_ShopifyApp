import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { ComplianceWebhookManager, type ComplianceWebhookPayload } from "../services/compliance-webhooks.server";
import { WebhookSecurity } from "../utils/webhook-security.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.text();
    
    console.log('Customer data request webhook received:', {
      method: request.method,
      hasBody: !!body,
      bodyLength: body.length,
      hasSignature: !!WebhookSecurity.extractHmacSignature(request),
      headers: Object.fromEntries(request.headers.entries())
    });
    
    const verification = await WebhookSecurity.verifyWebhookRequest(request, body);
    if (!verification.valid) {
      console.error("HMAC verification failed:", verification.error);
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(body) as ComplianceWebhookPayload;
    console.log("Received customer data request webhook", { 
      shop: payload.shop_domain,
      customerId: payload.customer?.id 
    });

    const customerData = await ComplianceWebhookManager.handleCustomerDataRequest(payload);
    
    return json({
      success: true,
      data: customerData
    }, { status: 200 });

  } catch (error) {
    console.error("Error processing customer data request webhook:", error);
    if (error instanceof SyntaxError) {
      return json({ error: "Invalid JSON payload" }, { status: 401 });
    }
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};