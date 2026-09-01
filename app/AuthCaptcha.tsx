"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const captchaRequired = process.env.NEXT_PUBLIC_SUPABASE_REQUIRE_CAPTCHA === "true";

export default function AuthCaptcha({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !siteKey || !container.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
      theme: "light",
      size: "flexible",
    });
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [onToken, scriptReady, siteKey]);

  useEffect(() => {
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetKey]);

  if (!siteKey) return captchaRequired ? <div className="auth-message">Güvenlik doğrulaması yapılandırılmamış. Sistem yöneticinize başvurun.</div> : null;
  return <div className="auth-captcha"><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => setScriptReady(true)}/><div ref={container}/></div>;
}
