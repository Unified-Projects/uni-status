"use client";

import { Button } from "@uni-status/ui";
import { signInWithOAuth } from "@uni-status/auth/client";
import { useState } from "react";

// Provider configurations with icons and styling
const PROVIDER_CONFIG: Record<string, {
  name: string;
  icon: React.ReactNode;
  className: string;
}> = {
  google: {
    name: "Google",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    className: "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300",
  },
  github: {
    name: "GitHub",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
    className: "bg-gray-900 hover:bg-gray-800 text-white",
  },
  microsoft: {
    name: "Microsoft",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#F25022" d="M1 1h10v10H1z"/>
        <path fill="#00A4EF" d="M1 13h10v10H1z"/>
        <path fill="#7FBA00" d="M13 1h10v10H13z"/>
        <path fill="#FFB900" d="M13 13h10v10H13z"/>
      </svg>
    ),
    className: "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300",
  },
  okta: {
    name: "Okta",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.389 0 0 5.389 0 12s5.389 12 12 12 12-5.389 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/>
      </svg>
    ),
    className: "bg-[#007DC1] hover:bg-[#006BA1] text-white",
  },
  auth0: {
    name: "Auth0",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.98 7.448L19.62 0H4.347L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12.007 24l6.157-4.552c3.755-2.81 5.182-7.688 3.815-12.015l-6.16 4.58 2.343 7.45-6.157-4.597-6.158 4.58 2.358-7.433-6.188-4.55 7.63-.045L12.008 0l2.356 7.404 7.615.044z"/>
      </svg>
    ),
    className: "bg-[#EB5424] hover:bg-[#D14714] text-white",
  },
  keycloak: {
    name: "Keycloak",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0L1.5 6v12L12 24l10.5-6V6L12 0zm0 2.25l8.25 4.75v9.5L12 21.25l-8.25-4.75v-9.5L12 2.25z"/>
      </svg>
    ),
    className: "bg-[#4D4D4D] hover:bg-[#3D3D3D] text-white",
  },
  oidc: {
    name: "SSO",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <polyline points="10,17 15,12 10,7"/>
        <line x1="15" y1="12" x2="3" y2="12"/>
      </svg>
    ),
    className: "bg-indigo-600 hover:bg-indigo-700 text-white",
  },
};

interface OAuthProvider {
  id: string;
  name: string;
}

interface OAuthProviderButtonsProps {
  providers: OAuthProvider[];
  callbackURL?: string;
  className?: string;
  layout?: "grid" | "stack";
}

export function OAuthProviderButtons({
  providers,
  callbackURL = "/dashboard",
  className = "",
  layout = "grid",
}: OAuthProviderButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signInWithOAuth(providerId, { callbackURL });
    } catch (error) {
      console.error("OAuth sign-in failed:", error);
      setLoadingProvider(null);
    }
  };

  if (providers.length === 0) {
    return null;
  }

  const gridClass = layout === "grid"
    ? providers.length === 1
      ? "grid-cols-1"
      : "grid-cols-2"
    : "grid-cols-1";

  return (
    <div className={`grid ${gridClass} gap-3 ${className}`}>
      {providers.map((provider) => {
        const config = PROVIDER_CONFIG[provider.id] || {
          name: provider.name,
          icon: (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          ),
          className: "bg-gray-600 hover:bg-gray-700 text-white",
        };

        const isLoading = loadingProvider === provider.id;

        return (
          <Button
            key={provider.id}
            variant="outline"
            className={`flex items-center justify-center gap-2 h-11 ${config.className}`}
            onClick={() => handleSignIn(provider.id)}
            disabled={loadingProvider !== null}
          >
            {isLoading ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
            ) : (
              config.icon
            )}
            <span>{config.name}</span>
          </Button>
        );
      })}
    </div>
  );
}

// Divider component for "or continue with"
export function AuthDivider({ text = "or continue with" }: { text?: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">
          {text}
        </span>
      </div>
    </div>
  );
}
