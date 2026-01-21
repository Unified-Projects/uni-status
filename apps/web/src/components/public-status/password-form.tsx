"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn, Button, Input, Label } from "@uni-status/ui";
import { Lock, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

interface PasswordFormProps {
  slug: string;
  className?: string;
}

// Always use relative URL for public status page API calls to avoid CORS issues on custom domains
const API_URL = "/api";

export function PasswordForm({ slug, className }: PasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setStatus("error");
      setErrorMessage("Please enter the password");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(
        `${API_URL}/public/status-pages/${slug}/verify-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ password }),
        }
      );

      const data = await response.json();

      if (data.success) {
        // Cookie is set by the server, refresh the page to show content
        router.refresh();
      } else {
        setStatus("error");
        setErrorMessage(data.error?.message || "Invalid password");
      }
    } catch {
      setStatus("error");
      setErrorMessage("An error occurred. Please try again.");
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--status-card)] p-6 shadow-sm",
        className
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (status === "error") {
                  setStatus("idle");
                  setErrorMessage("");
                }
              }}
              disabled={status === "loading"}
              className={cn(
                "pr-10",
                status === "error" && "border-status-error-solid focus-visible:ring-status-error-solid"
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--status-muted-text)] hover:text-[var(--status-text)] transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {status === "error" && errorMessage && (
          <div className="flex items-center gap-2 text-status-error-text text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={status === "loading"}>
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            "View Status Page"
          )}
        </Button>
      </form>
    </div>
  );
}
