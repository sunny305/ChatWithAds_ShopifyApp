import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";
import { ComplianceWebhookManager, type ComplianceWebhookPayload } from "../services/compliance-webhooks.server";

function verifyShopifyWebhook(body: string, signature: string): boolean {
  if (!signature) {
    console.error("Missing HMAC signature header");
    return false;
  }

  // Use Shopify API secret for webhook verification (standard practice)
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("SHOPIFY_API_SECRET environment variable not set");
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
  
  const isValid = crypto.timingSafeEqual(
    Buffer.from(cleanSignature),
    Buffer.from(computedSignature)
  );
  
  return isValid;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");
    
    console.log('Shop redact webhook received:', {
      method: request.method,
      hasBody: !!body,
      bodyLength: body.length,
      hasSignature: !!signature,
      url: request.url
    });
    
    const isValid = verifyShopifyWebhook(body, signature || '');
    if (!isValid) {
      console.error("Invalid webhook signature - returning 401");
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