import { useEffect, useRef, useState } from "react";

const SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY as string | undefined;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      ready: (callback: () => void) => void;
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile. The token is sent as captcha_token on POST /api/bookings/.
 * Error 110200 ("Unable to connect to website") means this page's hostname is
 * not on the widget's allow list. Turnstile retries that forever unless we stop it.
 */
export default function CaptchaWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let widgetId: string | undefined;

    const render = () => {
      const el = containerRef.current;
      const turnstile = window.turnstile;
      if (cancelled || !el || !turnstile || widgetId) return;
      const box = el.getBoundingClientRect();
      const opacity = Number.parseFloat(getComputedStyle(el).opacity);
      // The booking step fades in. Rendering during that animation makes
      // Turnstile fail the challenge and refresh itself.
      if (box.width < 8 || opacity < 0.99) {
        requestAnimationFrame(render);
        return;
      }
      widgetId = turnstile.render(el, {
        sitekey: SITE_KEY,
        retry: "auto",
        "retry-interval": 8000,
        callback: (token: string) => {
          setProblem(null);
          onVerifyRef.current(token);
        },
        "error-callback": (code: string) => {
          onVerifyRef.current("");
          if (code === "110200") {
            setProblem(
              `Cloudflare is blocking this check because “${window.location.hostname}” is not an allowed address for the widget. In Cloudflare, open Turnstile, edit this widget, and add that hostname. The box will keep refreshing until you do.`,
            );
            return true;
          }
          setProblem("The human check couldn't load. Please refresh and try again.");
          return false;
        },
        "expired-callback": () => {
          setProblem("That check expired. Please confirm it again.");
          onVerifyRef.current("");
        },
        "timeout-callback": () => {
          setProblem("The human check timed out. Please try again.");
          onVerifyRef.current("");
        },
      });
    };

    const mount = () => {
      if (cancelled || !window.turnstile) return;
      window.turnstile.ready(render);
    };

    if (window.turnstile) {
      mount();
    } else {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", mount);
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = mount;
        script.onerror = () => setProblem("The human check couldn't be reached. Please refresh and try again.");
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!SITE_KEY) {
    return (
      <p className="rounded-2xl border border-dashed border-sand-deep bg-cream px-4 py-3 text-sm text-muted">
        The human check isn't configured in this environment.
      </p>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="min-h-16" />
      {problem ? (
        <p className="mt-2 text-sm text-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
