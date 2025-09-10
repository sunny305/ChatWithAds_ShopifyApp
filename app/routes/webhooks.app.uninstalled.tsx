import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { chatWithAdsAPI } from "../services/chatwith-ads-api.server";
import { WebhookSecurity } from "../utils/webhook-security.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // First verify HMAC signature for security
    const body = await request.text();
    const verification = await WebhookSecurity.verifyWebhookRequest(request, body);
    
    if (!verification.valid) {
      console.error('App uninstall webhook HMAC verification failed:', verification.error);
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create new request with body for Shopify authentication
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: body
    });

    const { shop, session, topic } = await authenticate.webhook(newRequest);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await prisma.session.deleteMany({ where: { shop } });
    }

    // Notify ChatWith Ads platform (best-effort)
    try {
      await chatWithAdsAPI.notifyUninstall(shop);
    } catch (err) {
      console.error('Failed to notify ChatWith Ads uninstall:', err);
    }

    return new Response();
  } catch (error) {
    console.error('Error processing app uninstall webhook:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

