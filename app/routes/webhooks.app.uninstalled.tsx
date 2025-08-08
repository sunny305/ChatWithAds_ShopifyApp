import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { chatWithAdsAPI } from "../services/chatwith-ads-api.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

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
};

