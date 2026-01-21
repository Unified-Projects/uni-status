"use client";

import { useState } from "react";
import { cn, Button, Input } from "@uni-status/ui";
import { Bell, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";

interface SubscribeFormProps {
  slug: string;
  className?: string;
}

// Always use relative URL for public status page API calls to avoid CORS issues on custom domains
const API_URL = "/api";

export function SubscribeForm({ slug, className }: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setStatus("error");
      setMessage(t("subscribe.invalid", "Please enter your email address"));
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/public/status-pages/${slug}/subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: email.trim() }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setStatus("success");
        setMessage(
          data.message ||
            t("subscribe.success", "Please check your email to confirm your subscription.")
        );
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error?.message || t("subscribe.error", "Failed to subscribe. Please try again."));
      }
    } catch {
      setStatus("error");
      setMessage(t("subscribe.genericError", "An error occurred. Please try again later."));
    }
  };

  return (
    <div className={cn("text-center", className)}>
      <div className="flex items-center justify-center gap-2 mb-3">
        <Bell className="h-5 w-5 text-[var(--status-muted-text)]" />
        <h3 className="text-lg font-medium">{t("subscribe.title", "Subscribe to Updates")}</h3>
      </div>
      <p className="text-sm text-[var(--status-muted-text)] mb-4">
        {t("subscribe.description", "Get notified when there are changes to this status page.")}
      </p>

      {status === "success" ? (
        <div className="flex items-center justify-center gap-2 text-status-success-text bg-status-success-bg-subtle rounded-lg p-4 border border-status-success-border">
          <CheckCircle className="h-5 w-5" />
          <span>{message}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <div className="flex-1">
            <Input
              type="email"
              placeholder={t("subscribe.placeholder", "Enter your email")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") {
                  setStatus("idle");
                  setMessage("");
                }
              }}
              disabled={status === "loading"}
              className={cn(
                status === "error" && "border-status-error-solid focus-visible:ring-status-error-solid"
              )}
            />
          </div>
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("subscribe.loading", "Subscribing...")}
              </>
            ) : (
              t("subscribe.button", "Subscribe")
            )}
          </Button>
        </form>
      )}

      {status === "error" && message && (
        <div className="mt-3 flex items-center justify-center gap-2 text-status-error-text text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
