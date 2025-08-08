import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { chatWithAdsAPI } from "../services/chatwith-ads-api.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get existing connector configuration
  let connectorConfig = null;
  try {
    console.log('Prisma client in connector route:', typeof prisma);
    console.log('Prisma connectorConfig method:', typeof prisma.connectorConfig);
    
    if (prisma && prisma.connectorConfig) {
      connectorConfig = await prisma.connectorConfig.findUnique({
        where: { shop },
      });
    } else {
      console.error('Prisma client or connectorConfig method not available');
    }
  } catch (error) {
    console.error('Error in connector route:', error);
  }

  return json({
    shop,
    connectorId: connectorConfig?.connectorId || "",
    isActive: connectorConfig?.isActive || false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const formData = await request.formData();
  const connectorId = formData.get("connectorId") as string;
  const action = formData.get("_action") as string;

  // If no explicit action provided (e.g., embedded probes), return a no-op 200
  if (!action) {
    return json({ ok: true });
  }

  try {
    if (action === "save") {
      // Validate connector ID format
      const validGenericId = /^[a-zA-Z0-9-_]{6,64}$/.test(connectorId || "");
      const validCwadsId = (connectorId || "").startsWith("cwads-") && (connectorId || "").length <= 64;
      if (connectorId && !(validGenericId || validCwadsId)) {
        return json({
          error: "Invalid Connector ID. Use the ID from ChatWith Ads (e.g., cwads-xxxxxxxxxxxxxxxx) or an ID 6-64 chars with letters, numbers, - or _.",
        }, { status: 400 });
      }
      // If connectorId provided, perform handshake with platform first
      let isActiveToSave = false;
      let connectorIdToSave: string | null = null;
      if (connectorId) {
        const attach = await chatWithAdsAPI.attachConnector(shop, connectorId);
        if (!attach.success) {
          return json({ error: attach.error || "Invalid Connector ID. Please generate an ID in ChatWith Ads and try again." }, { status: 400 });
        }
        isActiveToSave = true;
        connectorIdToSave = connectorId;
      } else {
        // Clearing configuration
        isActiveToSave = false;
        connectorIdToSave = null;
      }

      // Save or update connector configuration
      if (prisma && prisma.connectorConfig) {
        await prisma.connectorConfig.upsert({
          where: { shop },
          update: {
            connectorId: connectorIdToSave,
            isActive: isActiveToSave,
            updatedAt: new Date(),
          },
          create: {
            shop,
            connectorId: connectorIdToSave,
            isActive: isActiveToSave,
          },
        });
      } else {
        throw new Error('Database not available');
      }

      return json({
        success: true,
        message: isActiveToSave
          ? "Connection verified and saved."
          : "Connector configuration cleared.",
      });
    }

    if (action === "test") {
      if (!connectorId) {
        return json({ error: "Please enter a connector ID to test the connection." }, { status: 400 });
      }
      // Handshake: verify connector exists and attach mapping
      const attach = await chatWithAdsAPI.attachConnector(shop, connectorId);
      if (!attach.success) {
        return json({ error: attach.error || "Invalid Connector ID. Please verify in ChatWith Ads." }, { status: 400 });
      }
      // Health check against platform API using server env creds
      const result = await chatWithAdsAPI.testConnection();
      if (!result.connected) {
        return json({ error: result.error || "Platform health check failed. Verify API URL/KEY envs." }, { status: 502 });
      }
      return json({ success: true, message: "Connection verified." });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Connector configuration error:", error);
    return json({
      error: "Failed to save connector configuration. Please try again.",
    }, { status: 500 });
  }
};

export default function ConnectorConfig() {
  const { shop, connectorId: initialConnectorId, isActive } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [connectorId, setConnectorId] = useState(initialConnectorId);
  const [btnAction, setBtnAction] = useState<string | undefined>(undefined);

  const isLoading = navigation.state === "submitting";
  const isSaving = navigation.formData?.get("_action") === "save";
  const isTesting = navigation.formData?.get("_action") === "test";

  return (
    <Page>
      <TitleBar title="ChatWith Ads Connector Configuration" />
      <BlockStack gap="500">
        
        {/* Configuration Instructions */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Connect Your ChatWith Ads Account
                </Text>
                <Text as="p" variant="bodyMd">
                  To sync your Shopify data with ChatWith Ads, enter your unique Connector ID below. 
                  You can find this ID in your ChatWith Ads dashboard under Settings → Integrations → Shopify.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Current shop: <Text as="span" fontWeight="bold">{shop}</Text>
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Success/Error Messages */}
        {(actionData as any)?.success && (
          <Layout>
            <Layout.Section>
              <Banner tone="success">
                {(actionData as any).message}
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {(actionData as any)?.error && (
          <Layout>
            <Layout.Section>
              <Banner tone="critical">
                {(actionData as any).error}
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {/* Connector ID Configuration */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Connector Configuration
                </Text>
                
                <Form method="post">
                  <BlockStack gap="400">
                    <TextField
                      label="ChatWith Ads Connector ID"
                      value={connectorId}
                      onChange={setConnectorId}
                      placeholder="e.g., cwads-abc123-xyz789"
                      helpText="Enter the unique connector ID from your ChatWith Ads dashboard"
                      autoComplete="off"
                    />
                    <input type="hidden" name="_action" value={btnAction || ""} />
                    <input type="hidden" name="connectorId" value={connectorId} />
                    
                    <InlineStack gap="300">
                      <Button
                        submit
                        variant="primary"
                        loading={isSaving}
                        disabled={isLoading}
                        onClick={() => setBtnAction('save')}
                      >
                        {connectorId ? "Save Connector ID" : "Clear Configuration"}
                      </Button>
                      
                      <Button
                        submit
                        disabled={!connectorId || isLoading}
                        loading={isTesting}
                        onClick={() => setBtnAction('test')}
                      >
                        Test Connection
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Current Status */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Connection Status
                </Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Status</Text>
                      <Text 
                        as="span" 
                        variant="bodyMd" 
                        tone={isActive ? "success" : "subdued"}
                      >
                        {isActive ? "✅ Connected" : "⚠️ Not Connected"}
                      </Text>
                    </InlineStack>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Connector ID</Text>
                      <Text as="span" variant="bodyMd">
                        {connectorId || "Not set"}
                      </Text>
                    </InlineStack>
                  </Layout.Section>
                </Layout>
                
                {isActive && (
                  <Text as="p" variant="bodyMd" tone="success">
                    Your Shopify data is being synced to ChatWith Ads platform.
                  </Text>
                )}
                
                {!isActive && (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Configure your connector ID above to start syncing data.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Help Section */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Need Help?
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <Text as="span" fontWeight="bold">Where to find your Connector ID:</Text>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Log into your ChatWith Ads dashboard
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Go to Settings → Integrations → Shopify
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Copy your unique Connector ID
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Paste it in the field above and click "Save Connector ID"
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
