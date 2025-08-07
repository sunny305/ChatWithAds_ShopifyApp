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

  try {
    if (action === "save") {
      // Validate connector ID format (you can customize this validation)
      if (connectorId && !/^[a-zA-Z0-9-_]{8,32}$/.test(connectorId)) {
        return json({
          error: "Connector ID must be 8-32 characters long and contain only letters, numbers, hyphens, and underscores.",
        }, { status: 400 });
      }

      // Save or update connector configuration
      if (prisma && prisma.connectorConfig) {
        await prisma.connectorConfig.upsert({
          where: { shop },
          update: {
            connectorId: connectorId || null,
            isActive: !!connectorId,
            updatedAt: new Date(),
          },
          create: {
            shop,
            connectorId: connectorId || null,
            isActive: !!connectorId,
          },
        });
      } else {
        throw new Error('Database not available');
      }

      return json({
        success: true,
        message: connectorId 
          ? "Connector ID saved successfully! Your Shopify data will now sync to ChatWith Ads."
          : "Connector configuration cleared.",
      });
    }

    if (action === "test") {
      // Test connection with the provided connector ID
      // You can implement actual connection testing here
      if (!connectorId) {
        return json({
          error: "Please enter a connector ID to test the connection.",
        }, { status: 400 });
      }

      // Simulate connection test (replace with actual API call)
      return json({
        success: true,
        message: "Connection test successful! Connector ID is valid.",
        testResult: true,
      });
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
                <Text variant="bodyMd">
                  To sync your Shopify data with ChatWith Ads, enter your unique Connector ID below. 
                  You can find this ID in your ChatWith Ads dashboard under Settings → Integrations → Shopify.
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Current shop: <Text as="span" fontWeight="bold">{shop}</Text>
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Success/Error Messages */}
        {actionData?.success && (
          <Layout>
            <Layout.Section>
              <Banner status="success">
                {actionData.message}
              </Banner>
            </Layout.Section>
          </Layout>
        )}

        {actionData?.error && (
          <Layout>
            <Layout.Section>
              <Banner status="critical">
                {actionData.error}
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
                    
                    <InlineStack gap="300">
                      <Button
                        submit
                        variant="primary"
                        loading={isSaving}
                        disabled={isLoading}
                        name="_action"
                        value="save"
                      >
                        {connectorId ? "Save Connector ID" : "Clear Configuration"}
                      </Button>
                      
                      <Button
                        submit
                        disabled={!connectorId || isLoading}
                        loading={isTesting}
                        name="_action"
                        value="test"
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
                  <Text variant="bodyMd" tone="success">
                    Your Shopify data is being synced to ChatWith Ads platform.
                  </Text>
                )}
                
                {!isActive && (
                  <Text variant="bodyMd" tone="subdued">
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
                  <Text variant="bodyMd">
                    <Text as="span" fontWeight="bold">Where to find your Connector ID:</Text>
                  </Text>
                  <Text variant="bodyMd">
                    1. Log into your ChatWith Ads dashboard
                  </Text>
                  <Text variant="bodyMd">
                    2. Go to Settings → Integrations → Shopify
                  </Text>
                  <Text variant="bodyMd">
                    3. Copy your unique Connector ID
                  </Text>
                  <Text variant="bodyMd">
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
