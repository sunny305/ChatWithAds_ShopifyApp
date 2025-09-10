import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { WebhookSecurity } from "../utils/webhook-security.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    try {
        // First verify HMAC signature for security
        const body = await request.text();
        const verification = await WebhookSecurity.verifyWebhookRequest(request, body);
        
        if (!verification.valid) {
            console.error('App scopes update webhook HMAC verification failed:', verification.error);
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Create new request with body for Shopify authentication
        const newRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: body
        });

        const { payload, session, topic, shop } = await authenticate.webhook(newRequest);
        console.log(`Received ${topic} webhook for ${shop}`);

        const current = payload.current as string[];
        if (session) {
            await prisma.session.update({   
                where: {
                    id: session.id
                },
                data: {
                    scope: current.toString(),
                },
            });
        }
        return new Response();
    } catch (error) {
        console.error('Error processing app scopes update webhook:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
