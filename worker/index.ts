/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { applySecurityHeaders } from "../lib/security";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  PAYMENT_API_KEY?: string;
  PAYMENT_API_URL?: string;
  PAYMENT_PROVIDER_NAME?: string;
  PAYMENT_CHECKOUT_HOSTS?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  ESIGN_API_KEY?: string;
  ESIGN_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  RESEND_FROM?: string;
  EXPO_ACCESS_TOKEN?: string;
  EXPO_PROJECT_ID?: string;
  FCM_SERVER_KEY?: string;
  EINVOICE_API_KEY?: string;
  EINVOICE_API_URL?: string;
  EINVOICE_PROVIDER_NAME?: string;
  EINVOICE_WEBHOOK_SECRET?: string;
  LEGAL_CONTROLLER_NAME?: string;
  LEGAL_CONTROLLER_EMAIL?: string;
  LEGAL_CONTROLLER_ADDRESS?: string;
  LEGAL_TERMS_EFFECTIVE_AT?: string;
  PUBLIC_SIGNUP_ENABLED?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    (globalThis as typeof globalThis & { __FILO_ENV?: Env }).__FILO_ENV = env;
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized=await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return applySecurityHeaders(optimized,request);
    }

    return applySecurityHeaders(await handler.fetch(request, env, ctx),request);
  },
};

export default worker;
