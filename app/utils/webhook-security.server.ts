import crypto from "node:crypto";

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export class WebhookSecurity {
  private static readonly SUPPORTED_HEADERS = [
    'x-shopify-hmac-sha256',
    'x-hub-signature-256'
  ];

  /**
   * Verifies HMAC signature for Shopify webhooks
   * @param body Raw request body as string
   * @param signature HMAC signature from request header
   * @param secret Secret key for HMAC verification (defaults to SHOPIFY_API_SECRET)
   * @returns Verification result with success status and optional error
   */
  static verifyHmacSignature(
    body: string, 
    signature: string | null, 
    secret?: string
  ): WebhookVerificationResult {
    if (!signature) {
      return {
        valid: false,
        error: 'Missing HMAC signature header'
      };
    }

    const webhookSecret = secret || process.env.SHOPIFY_API_SECRET;
    if (!webhookSecret) {
      return {
        valid: false,
        error: 'SHOPIFY_API_SECRET environment variable not set'
      };
    }

    try {
      // Remove common prefixes (sha256=, sha1=)
      const cleanSignature = signature.replace(/^(sha256=|sha1=)/, '');
      
      // Create HMAC using SHA-256
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(body, 'utf8');
      const computedSignature = hmac.digest('base64');
      
      // Use timing-safe comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(cleanSignature, 'base64'),
        Buffer.from(computedSignature, 'base64')
      );

      if (!isValid) {
        console.error('HMAC verification failed:', {
          receivedLength: cleanSignature.length,
          computedLength: computedSignature.length,
          bodyLength: body.length
        });
      }

      return {
        valid: isValid,
        error: isValid ? undefined : 'Invalid HMAC signature'
      };

    } catch (error) {
      console.error('HMAC verification error:', error);
      return {
        valid: false,
        error: `HMAC verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Extracts HMAC signature from request headers
   * @param request Remix request object
   * @returns HMAC signature string or null if not found
   */
  static extractHmacSignature(request: Request): string | null {
    for (const headerName of this.SUPPORTED_HEADERS) {
      const signature = request.headers.get(headerName);
      if (signature) {
        return signature;
      }
    }
    return null;
  }

  /**
   * Middleware function to verify webhook HMAC signatures
   * @param request Remix request object
   * @param body Raw request body
   * @param secret Optional custom secret (defaults to SHOPIFY_API_SECRET)
   * @returns Verification result
   */
  static async verifyWebhookRequest(
    request: Request, 
    body: string, 
    secret?: string
  ): Promise<WebhookVerificationResult> {
    const signature = this.extractHmacSignature(request);
    
    console.log('Webhook HMAC verification:', {
      method: request.method,
      url: request.url,
      hasSignature: !!signature,
      hasBody: !!body,
      bodyLength: body.length,
      contentType: request.headers.get('content-type')
    });

    return this.verifyHmacSignature(body, signature, secret);
  }

  /**
   * Validates that all required environment variables are set
   * @returns Array of missing environment variables
   */
  static validateEnvironment(): string[] {
    const required = ['SHOPIFY_API_SECRET'];
    const missing: string[] = [];

    for (const envVar of required) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    return missing;
  }
}