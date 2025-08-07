import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { chatWithAdsAPI } from "../services/chatwith-ads-api.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get connector configuration
  let connectorConfig = null;
  try {
    console.log('Attempting to query connector config for shop:', shop);
    console.log('Prisma client:', typeof prisma);
    console.log('Prisma connectorConfig:', typeof prisma.connectorConfig);
    
    connectorConfig = await prisma.connectorConfig.findUnique({
      where: { shop },
    });
    console.log('Connector config result:', connectorConfig);
  } catch (error) {
    console.error('Error querying connector config:', error);
    // Continue without connector config for now
  }

  // Get comprehensive analytics data
  // Try to fetch orders data, but handle gracefully if not approved
  let ordersData = null;
  let customersData = null;
  
  try {
    const ordersResponse = await admin.graphql(`
      #graphql
      query getOrdersData {
        orders(first: 250, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            processedAt
            createdAt
            updatedAt
            cancelledAt
            closedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            subtotalPriceSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            totalShippingPriceSet {
              shopMoney {
                amount
              }
            }
            lineItems(first: 10) {
              edges {
                node {
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
            customer {
              id
              email
              createdAt
            }
            displayFinancialStatus
          }
        }
      }
    `);
    ordersData = await ordersResponse.json();
  } catch (error) {
    console.log("Orders data not accessible - app needs approval for protected customer data");
  }

  try {
    const customersResponse = await admin.graphql(`
      #graphql
      query getCustomersData {
        customers(first: 250, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            email
            firstName
            lastName
            createdAt
            updatedAt
            defaultAddress {
              city
              country
              countryCodeV2
              province
            }
            state
          }
        }
      }
    `);
    customersData = await customersResponse.json();
  } catch (error) {
    console.log("Customers data not accessible - app needs approval for protected customer data");
  }

  // Always fetch products data (this should work)
  const productsResponse = await admin.graphql(`
    #graphql
    query getProductsAndShopData {
      products(first: 100, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            status
            productType
            vendor
            tags
            totalInventory
            createdAt
            updatedAt
            publishedAt
            handle
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  sku
                  inventoryQuantity
                  createdAt
                  updatedAt
                }
              }
            }
            images(first: 5) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            collections(first: 10) {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            description
            productsCount {
              count
            }
            updatedAt
          }
        }
      }
      shop {
        id
        name
        email
        currencyCode
        createdAt
        updatedAt
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
      }
    }
  `);

  const productsData = await productsResponse.json();

  // Combine all data
  const analyticsData = {
    data: {
      orders: ordersData?.data?.orders || null,
      customers: customersData?.data?.customers || null,
      products: productsData?.data?.products || null,
      collections: productsData?.data?.collections || null,
      shop: productsData?.data?.shop || null
    }
  };

  // Calculate comprehensive metrics
  
  // Revenue & Order Analytics
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalItems = 0;
  let totalTax = 0;
  let totalShipping = 0;
  let paidOrders = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;
  let returningCustomerOrders = 0;
  let newCustomerOrders = 0;
  
  // Customer Analytics  
  let totalCustomers = 0;
  let customersWithOrders = 0;
  let customerCountries = new Set();
  let customerCities = new Set();
  let repeatCustomers = 0;
  let customerOrderCounts = new Map(); // Track orders per customer
  
  // Product Analytics
  let totalProducts = 0;
  let activeProducts = 0;
  let draftProducts = 0;
  let archivedProducts = 0;
  let totalVariants = 0;
  let totalInventory = 0;
  let totalInventoryValue = 0;
  let totalCompareAtValue = 0;
  let productsWithImages = 0;
  let productsInCollections = 0;
  let totalTags = new Set();
  let vendorCount = new Set();
  let productTypes = new Set();
  let variantsWithSKU = 0;
  let pricedVariants = 0;
  let compareAtPriceVariants = 0;
  
  // Process Orders Data (if available)
  const hasOrdersData = analyticsData.data?.orders?.edges;
  if (hasOrdersData) {
    analyticsData.data.orders.edges.forEach((order: any) => {
      const orderNode = order.node;
      totalOrders += 1;
      
      // Revenue calculations
      if (orderNode.totalPriceSet?.shopMoney?.amount) {
        totalRevenue += parseFloat(orderNode.totalPriceSet.shopMoney.amount);
      }
      
      if (orderNode.totalTaxSet?.shopMoney?.amount) {
        totalTax += parseFloat(orderNode.totalTaxSet.shopMoney.amount);
      }
      
      if (orderNode.totalShippingPriceSet?.shopMoney?.amount) {
        totalShipping += parseFloat(orderNode.totalShippingPriceSet.shopMoney.amount);
      }
      
      // Order status tracking using displayFinancialStatus
      if (orderNode.displayFinancialStatus === 'PAID') paidOrders += 1;
      else if (orderNode.displayFinancialStatus === 'PENDING') pendingOrders += 1;
      
      if (orderNode.cancelledAt) cancelledOrders += 1;
      
      // Track customer orders for repeat customer calculation
      const customerEmail = orderNode.customer?.email;
      if (customerEmail) {
        const currentCount = customerOrderCounts.get(customerEmail) || 0;
        customerOrderCounts.set(customerEmail, currentCount + 1);
        
        if (currentCount > 0) {
          returningCustomerOrders += 1;
        } else {
          newCustomerOrders += 1;
        }
      } else {
        newCustomerOrders += 1;
      }
      
      // Items count
      orderNode.lineItems?.edges?.forEach((item: any) => {
        totalItems += item.node.quantity || 0;
      });
    });
  }
  
  // Process Customers Data (if available)  
  const hasCustomersData = analyticsData.data?.customers?.edges;
  if (hasCustomersData) {
    analyticsData.data.customers.edges.forEach((customer: any) => {
      const customerNode = customer.node;
      totalCustomers += 1;
      
      // We'll calculate customers with orders from the order data instead
      
      if (customerNode.defaultAddress?.country) {
        customerCountries.add(customerNode.defaultAddress.country);
      }
      
      if (customerNode.defaultAddress?.city) {
        customerCities.add(customerNode.defaultAddress.city);
      }
    });
  }
  
  // Calculate repeat customers and customers with orders from order tracking
  customersWithOrders = customerOrderCounts.size; // Unique customers who have orders
  customerOrderCounts.forEach((orderCount) => {
    if (orderCount > 1) {
      repeatCustomers += 1;
    }
  });

  // Products analytics
  if (analyticsData.data?.products?.edges) {
    analyticsData.data.products.edges.forEach((product: any) => {
      const node = product.node;
      totalProducts += 1;
      
      // Status tracking
      if (node.status === 'ACTIVE') activeProducts += 1;
      else if (node.status === 'DRAFT') draftProducts += 1;
      else if (node.status === 'ARCHIVED') archivedProducts += 1;
      
      // Inventory tracking
      totalInventory += node.totalInventory || 0;
      
      // Content tracking
      if (node.images?.edges?.length > 0) productsWithImages += 1;
      if (node.collections?.edges?.length > 0) productsInCollections += 1;
      if (node.vendor) vendorCount.add(node.vendor);
      if (node.productType) productTypes.add(node.productType);
      
      // Tags
      if (node.tags) {
        node.tags.forEach((tag: string) => totalTags.add(tag));
      }
      
      // Variants analytics
      node.variants.edges.forEach((variant: any) => {
        const vNode = variant.node;
        totalVariants += 1;
        
        if (vNode.price) {
          pricedVariants += 1;
          const price = parseFloat(vNode.price);
          const quantity = vNode.inventoryQuantity || 0;
          totalInventoryValue += price * quantity;
        }
        
        if (vNode.compareAtPrice) {
          compareAtPriceVariants += 1;
          const comparePrice = parseFloat(vNode.compareAtPrice);
          const quantity = vNode.inventoryQuantity || 0;
          totalCompareAtValue += comparePrice * quantity;
        }
        
        if (vNode.sku) variantsWithSKU += 1;
      });
    });
  }

  // Collections analytics
  let totalCollections = 0;
  let totalProductsInCollections = 0;
  let avgProductsPerCollection = 0;

  if (analyticsData.data?.collections?.edges) {
    totalCollections = analyticsData.data.collections.edges.length;
    analyticsData.data.collections.edges.forEach((collection: any) => {
      totalProductsInCollections += collection.node.productsCount?.count || 0;
    });
    avgProductsPerCollection = totalCollections > 0 ? totalProductsInCollections / totalCollections : 0;
  }

  // Shop analytics
  const shopData = analyticsData.data?.shop;
  const currentDate = new Date();
  const shopCreated = shopData?.createdAt ? new Date(shopData.createdAt) : null;
  const shopAge = shopCreated ? Math.floor((currentDate.getTime() - shopCreated.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // Sync data to ChatWith Ads platform (only if connector ID is configured)
  const shopDomain = shopData?.name || shop;
  let syncStatus = null;
  
  if (connectorConfig?.connectorId && connectorConfig?.isActive) {
    try {
      syncStatus = await chatWithAdsAPI.syncShopifyData(shopDomain, {
        analytics: {
          totalRevenue: totalRevenue.toFixed(2),
          totalOrders,
          totalItems,
          totalCustomers,
          activeProducts,
          // Add other key metrics for the external platform
        },
        orders: analyticsData.data?.orders?.edges || [],
        customers: analyticsData.data?.customers?.edges || [],
        products: analyticsData.data?.products?.edges || [],
        collections: analyticsData.data?.collections?.edges || [],
        shop: shopData || {}
      }, connectorConfig.connectorId);
      
      console.log('Data sync result:', syncStatus);
    } catch (error) {
      console.error('Data sync failed:', error);
      syncStatus = { success: false, error: 'Sync failed' };
    }
  } else {
    syncStatus = { success: false, error: 'Connector ID not configured' };
  }

  return {
    analytics: {
      // Revenue & Sales metrics
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders,
      totalItems,
      totalTax: totalTax.toFixed(2),
      totalShipping: totalShipping.toFixed(2),
      averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : '0.00',
      averageItemsPerOrder: totalOrders > 0 ? (totalItems / totalOrders).toFixed(1) : '0.0',
      
      // Order Status metrics
      paidOrders,
      pendingOrders,
      cancelledOrders,
      paymentSuccessRate: totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(1) : '0',
      cancellationRate: totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : '0',
      
      
      // Customer Acquisition
      returningCustomerOrders,
      newCustomerOrders,
      returningCustomerRate: totalOrders > 0 ? ((returningCustomerOrders / totalOrders) * 100).toFixed(1) : '0',
      
      // Customer Analytics
      totalCustomers,
      customersWithOrders,
      repeatCustomers,
      customerRetentionRate: totalCustomers > 0 ? ((repeatCustomers / totalCustomers) * 100).toFixed(1) : '0',
      customerCountries: customerCountries.size,
      customerCities: customerCities.size,
      conversionRate: totalCustomers > 0 ? ((customersWithOrders / totalCustomers) * 100).toFixed(1) : '0',
      
      // Product metrics
      totalProducts,
      activeProducts,
      draftProducts,
      archivedProducts,
      productActivationRate: totalProducts > 0 ? ((activeProducts / totalProducts) * 100).toFixed(1) : '0',
      
      // Variant metrics
      totalVariants,
      avgVariantsPerProduct: totalProducts > 0 ? (totalVariants / totalProducts).toFixed(1) : '0',
      pricedVariants,
      compareAtPriceVariants,
      variantsWithSKU,
      skuCoverage: totalVariants > 0 ? ((variantsWithSKU / totalVariants) * 100).toFixed(1) : '0',
      
      // Inventory metrics
      totalInventory,
      totalInventoryValue: totalInventoryValue.toFixed(2),
      totalCompareAtValue: totalCompareAtValue.toFixed(2),
      avgInventoryPerProduct: totalProducts > 0 ? (totalInventory / totalProducts).toFixed(1) : '0',
      
      // Content metrics
      productsWithImages,
      imagesCoverage: totalProducts > 0 ? ((productsWithImages / totalProducts) * 100).toFixed(1) : '0',
      productsInCollections,
      collectionCoverage: totalProducts > 0 ? ((productsInCollections / totalProducts) * 100).toFixed(1) : '0',
      
      // Catalog diversity
      uniqueTags: totalTags.size,
      uniqueVendors: vendorCount.size,
      uniqueProductTypes: productTypes.size,
      avgTagsPerProduct: totalProducts > 0 ? (totalTags.size / totalProducts).toFixed(1) : '0',
      
      // Collections metrics
      totalCollections,
      totalProductsInCollections,
      avgProductsPerCollection: avgProductsPerCollection.toFixed(1),
      
      
      // Shop info
      shopName: shopData?.name || 'Your Shop',
      currency: shopData?.currencyCode || 'USD',
      shopAge,
      planName: shopData?.plan?.displayName || 'Unknown',
      isShopifyPlus: shopData?.plan?.shopifyPlus || false,
      isPartnerDevelopment: shopData?.plan?.partnerDevelopment || false,
      
      
      // Data availability
      hasOrdersData: !!hasOrdersData,
      hasCustomersData: !!hasCustomersData,
      dataNote: hasOrdersData 
        ? `Analytics based on recent ${totalOrders} orders and ${totalCustomers} customers`
        : 'Product and inventory analytics available. For revenue and customer data, app needs approval for protected customer data.',
      approvalNeeded: !hasOrdersData,
      
      // Sync status
      syncStatus: syncStatus?.success ? 'Connected' : 'Disconnected',
      lastSync: syncStatus?.success ? new Date().toISOString() : null,
      syncError: syncStatus?.error || null,
      connectorId: connectorConfig?.connectorId || null,
      isConfigured: !!(connectorConfig?.connectorId && connectorConfig?.isActive)
    },
    orders: analyticsData.data?.orders?.edges || [],
    customers: analyticsData.data?.customers?.edges || [],
    products: analyticsData.data?.products?.edges || [],
    collections: analyticsData.data?.collections?.edges || [],
    shop: analyticsData.data?.shop || {}
  };
};

export default function Index() {
  const { analytics } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="ChatWith Ads - Shopify Data Connector" />
      <BlockStack gap="500">
        
        {/* Connection Status */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  ChatWith Ads Connector Status
                </Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Connection Status</Text>
                      <Text as="span" variant="bodyMd" tone={analytics.syncStatus === 'Connected' ? 'success' : 'critical'}>
                        {analytics.syncStatus}
                      </Text>
                    </InlineStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Connector ID</Text>
                      <Text as="span" variant="bodyMd">
                        {analytics.connectorId ? `${analytics.connectorId.substring(0, 12)}...` : 'Not set'}
                      </Text>
                    </InlineStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Last Sync</Text>
                      <Text as="span" variant="bodyMd">
                        {analytics.lastSync ? new Date(analytics.lastSync).toLocaleString() : 'Never'}
                      </Text>
                    </InlineStack>
                  </Layout.Section>
                </Layout>
                
                {!analytics.isConfigured && (
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" tone="warning">
                      ⚠️ Connector ID not configured. Click "Setup Connector" to connect your ChatWith Ads account.
                    </Text>
                    <Link to="/app/connector">
                      <Button variant="primary" size="slim">Setup Connector</Button>
                    </Link>
                  </InlineStack>
                )}
                
                {analytics.syncError && analytics.isConfigured && (
                  <Text variant="bodyMd" tone="critical">
                    Sync Error: {analytics.syncError}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Shop Overview */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  {analytics.shopName} - Shopify Data Overview
                </Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Store Age</Text>
                      <Text as="span" variant="bodyMd">{analytics.shopAge} days</Text>
                    </InlineStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Plan</Text>
                      <Text as="span" variant="bodyMd">{analytics.planName}</Text>
                    </InlineStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Currency</Text>
                      <Text as="span" variant="bodyMd">{analytics.currency}</Text>
                    </InlineStack>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Revenue & Sales Analytics - Only show if orders data is available */}
        {analytics.hasOrdersData && (
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Revenue & Sales Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Revenue Metrics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Revenue</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.totalRevenue}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Tax</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.totalTax}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Shipping</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.totalShipping}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Average Order Value</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.averageOrderValue}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Order Analytics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Orders</Text>
                            <Text as="span" variant="headingMd">{analytics.totalOrders}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Paid Orders</Text>
                            <Text as="span" variant="headingMd">{analytics.paidOrders}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Payment Success Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.paymentSuccessRate}%</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Cancellation Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.cancellationRate}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Performance Metrics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Items Sold</Text>
                            <Text as="span" variant="headingMd">{analytics.totalItems}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Avg Items/Order</Text>
                            <Text as="span" variant="headingMd">{analytics.averageItemsPerOrder}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Returning Customer Orders</Text>
                            <Text as="span" variant="headingMd">{analytics.returningCustomerOrders}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Returning Customer Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.returningCustomerRate}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        )}

        {/* Customer Analytics - Only show if customers data is available */}
        {analytics.hasCustomersData && (
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Customer Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Customer Base</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Customers</Text>
                            <Text as="span" variant="headingMd">{analytics.totalCustomers}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Customers w/ Orders</Text>
                            <Text as="span" variant="headingMd">{analytics.customersWithOrders}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Repeat Customers</Text>
                            <Text as="span" variant="headingMd">{analytics.repeatCustomers}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Customer Retention Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.customerRetentionRate}%</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Conversion Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.conversionRate}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Geographic Analytics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Countries Reached</Text>
                            <Text as="span" variant="headingMd">{analytics.customerCountries}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Cities Reached</Text>
                            <Text as="span" variant="headingMd">{analytics.customerCities}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Customer Base</Text>
                            <Text as="span" variant="headingMd">{analytics.totalCustomers} total</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        )}

        {/* App Approval Notice - Show if orders/customers data not available */}
        {analytics.approvalNeeded && (
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="warning">App Approval Required for Complete Analytics</Text>
                <Text variant="bodyMd">
                  To access revenue, orders, and customer analytics, your app needs approval for protected customer data.
                </Text>
                <Text variant="bodyMd">
                  Visit <Text as="span" variant="bodyMd" fontWeight="bold">Shopify Partners Dashboard</Text> → Your App → <Text as="span" variant="bodyMd" fontWeight="bold">App Store Listing</Text> to request access to protected customer data.
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  Learn more: https://shopify.dev/docs/apps/launch/protected-customer-data
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        )}

        {/* Product Analytics */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Product Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Product Status</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Products</Text>
                            <Text as="span" variant="headingMd">{analytics.totalProducts}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Active Products</Text>
                            <Text as="span" variant="headingMd">{analytics.activeProducts}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Draft Products</Text>
                            <Text as="span" variant="headingMd">{analytics.draftProducts}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Archived Products</Text>
                            <Text as="span" variant="headingMd">{analytics.archivedProducts}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Activation Rate</Text>
                            <Text as="span" variant="headingMd">{analytics.productActivationRate}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Variant Analytics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Variants</Text>
                            <Text as="span" variant="headingMd">{analytics.totalVariants}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Avg Variants/Product</Text>
                            <Text as="span" variant="headingMd">{analytics.avgVariantsPerProduct}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Priced Variants</Text>
                            <Text as="span" variant="headingMd">{analytics.pricedVariants}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Compare At Price</Text>
                            <Text as="span" variant="headingMd">{analytics.compareAtPriceVariants}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">SKU Coverage</Text>
                            <Text as="span" variant="headingMd">{analytics.skuCoverage}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Inventory & Financial */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Inventory & Financial Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Inventory Metrics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Inventory</Text>
                            <Text as="span" variant="headingMd">{analytics.totalInventory}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Avg Inventory/Product</Text>
                            <Text as="span" variant="headingMd">{analytics.avgInventoryPerProduct}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Financial Values</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Inventory Value</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.totalInventoryValue}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Compare At Value</Text>
                            <Text as="span" variant="headingMd">{analytics.currency} {analytics.totalCompareAtValue}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Variants with SKU</Text>
                            <Text as="span" variant="headingMd">{analytics.variantsWithSKU}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Content & Catalog */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Content & Catalog Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Content Quality</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Products w/ Images</Text>
                            <Text as="span" variant="headingMd">{analytics.productsWithImages}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Images Coverage</Text>
                            <Text as="span" variant="headingMd">{analytics.imagesCoverage}%</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">In Collections</Text>
                            <Text as="span" variant="headingMd">{analytics.productsInCollections}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Collection Coverage</Text>
                            <Text as="span" variant="headingMd">{analytics.collectionCoverage}%</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Catalog Diversity</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Unique Tags</Text>
                            <Text as="span" variant="headingMd">{analytics.uniqueTags}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Unique Vendors</Text>
                            <Text as="span" variant="headingMd">{analytics.uniqueVendors}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Product Types</Text>
                            <Text as="span" variant="headingMd">{analytics.uniqueProductTypes}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Avg Tags/Product</Text>
                            <Text as="span" variant="headingMd">{analytics.avgTagsPerProduct}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Collections Analytics */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingLg">Collections Analytics</Text>
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Collection Metrics</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Total Collections</Text>
                            <Text as="span" variant="headingMd">{analytics.totalCollections}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Products in Collections</Text>
                            <Text as="span" variant="headingMd">{analytics.totalProductsInCollections}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Avg Products/Collection</Text>
                            <Text as="span" variant="headingMd">{analytics.avgProductsPerCollection}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingMd">Store Plan</Text>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Plan Name</Text>
                            <Text as="span" variant="headingMd">{analytics.planName}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Shopify Plus</Text>
                            <Text as="span" variant="headingMd">{analytics.isShopifyPlus ? 'Yes' : 'No'}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodyMd">Partner Development</Text>
                            <Text as="span" variant="headingMd">{analytics.isPartnerDevelopment ? 'Yes' : 'No'}</Text>
                          </InlineStack>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Data Summary */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="success">ChatWith Ads Integration</Text>
                <Text variant="bodyMd">
                  {analytics.dataNote}
                </Text>
                <Text variant="bodyMd" tone="subdued">
                  This connector automatically syncs your Shopify data to the ChatWith Ads platform, enabling unified ad management across all your marketing channels. Your store data is continuously synchronized to provide real-time insights and automated ad optimization.
                </Text>
                {analytics.syncStatus === 'Connected' && analytics.isConfigured && (
                  <Text variant="bodyMd" tone="success">
                    ✅ Your Shopify data is being successfully synced to ChatWith Ads platform using Connector ID: {analytics.connectorId}
                  </Text>
                )}
                {!analytics.isConfigured && (
                  <BlockStack gap="200">
                    <Text variant="bodyMd" tone="warning">
                      ⚠️ Connector ID not configured. To start syncing your Shopify data:
                    </Text>
                    <Text variant="bodyMd">
                      1. Get your Connector ID from your ChatWith Ads dashboard
                    </Text>
                    <Text variant="bodyMd">
                      2. Go to "Connector Setup" in the navigation menu
                    </Text>
                    <Text variant="bodyMd">
                      3. Enter your Connector ID and save
                    </Text>
                    <Link to="/app/connector">
                      <Button variant="primary">Setup Connector Now</Button>
                    </Link>
                  </BlockStack>
                )}
                {analytics.syncError && analytics.isConfigured && (
                  <Text variant="bodyMd" tone="critical">
                    ❌ Sync Error: {analytics.syncError}. Please check your connector configuration.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
