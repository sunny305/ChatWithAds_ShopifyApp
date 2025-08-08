import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";
import { ComplianceWebhookManager, type ComplianceWebhookPayload } from "../services/compliance-webhooks.server";

function verifyShopifyWebhook(body: string, signature: string): boolean {
  if (!signature) {
    console.error("Missing HMAC signature header");
    return false;
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("SHOPIFY_API_SECRET environment variable not set");
    return false;
  }

  const cleanSignature = signature.replace('sha256=', '');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const computedSignature = hmac.digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(cleanSignature),
    Buffer.from(computedSignature)
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");
    
    console.log('Customer data request webhook received:', {
      method: request.method,
      hasBody: !!body,
      bodyLength: body.length,
      hasSignature: !!signature,
      headers: Object.fromEntries(request.headers.entries())
    });
    
    if (!signature) {
      console.error("Missing HMAC signature header");
      return json({ error: "Missing signature" }, { status: 401 });
    }

    const isValid = verifyShopifyWebhook(body, signature);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return json({ error: "Invalid signature" }, { status: 401 });
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