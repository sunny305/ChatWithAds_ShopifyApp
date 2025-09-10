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
    
    console.log('Shop redact webhook received:', {
      method: request.method,
      hasBody: !!body,
      bodyLength: body.length,
      hasSignature: !!WebhookSecurity.extractHmacSignature(request),
      url: request.url
    });
    
    const verification = await WebhookSecurity.verifyWebhookRequest(request, body);
    if (!verification.valid) {
      console.error("HMAC verification failed:", verification.error);
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log("HMAC verification passed for shop redact webhook");

    const payload = JSON.parse(body) as ComplianceWebhookPayload;
    console.log("Received shop redaction webhook", { 
      shop: payload.shop_domain 
    });

    await ComplianceWebhookManager.handleShopRedact(payload);
    
    return json({
      success: true,
      message: "Shop data redacted successfully"
    }, { status: 200 });

  } catch (error) {
    console.error("Error processing shop redaction webhook:", error);
    if (error instanceof SyntaxError) {
      return json({ error: "Invalid JSON payload" }, { status: 401 });
    }
    return json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};