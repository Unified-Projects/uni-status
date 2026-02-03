"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  LoadingButton,
  Input,
  Label,
  Switch,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Alert,
  AlertDescription,
  toast,
} from "@uni-status/ui";
import { Zap, Key, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { apiClient, queryKeys } from "@/lib/api-client";
import { useOrganization } from "@/hooks/use-organization";

const integrationsSchema = z.object({
  pagespeed: z.object({
    enabled: z.boolean(),
    apiKey: z.string().optional(),
  }),
});

type IntegrationsValues = z.infer<typeof integrationsSchema>;

interface IntegrationsData {
  pagespeed: {
    enabled: boolean;
    hasApiKey: boolean;
    apiKeyPreview: string | null;
  };
}

export function IntegrationsForm() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");

  // Fetch current integrations
  const { data: integrations, isLoading } = useQuery({
    queryKey: queryKeys.organizations.integrations(organizationId),
    queryFn: () => apiClient.organizations.getIntegrations(organizationId),
    enabled: !!organizationId,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<IntegrationsValues>({
    resolver: zodResolver(integrationsSchema) as any,
    defaultValues: {
      pagespeed: {
        enabled: integrations?.pagespeed?.enabled ?? false,
        apiKey: "",
      },
    },
    values: {
      pagespeed: {
        enabled: integrations?.pagespeed?.enabled ?? false,
        apiKey: "",
      },
    },
  });

  const pagespeedEnabled = watch("pagespeed.enabled");

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: IntegrationsValues) => {
      const payload: { pagespeed?: { enabled?: boolean; apiKey?: string } } = {
        pagespeed: {
          enabled: data.pagespeed.enabled,
        },
      };
      // Only include API key if it was changed
      if (apiKeyValue) {
        payload.pagespeed!.apiKey = apiKeyValue;
      }
      return apiClient.organizations.updateIntegrations(organizationId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.integrations(organizationId) });
      setApiKeyValue("");
      toast({
        title: "Integrations updated",
        description: "Your integration settings have been saved",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update integrations",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: IntegrationsValues) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>
            Configure third-party integrations for enhanced monitoring capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PageSpeed Insights Integration */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Google PageSpeed Insights</h3>
                  {integrations?.pagespeed?.enabled ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Enable Lighthouse scores and Core Web Vitals monitoring for HTTP monitors
                </p>
              </div>
              <Switch
                checked={pagespeedEnabled}
                onCheckedChange={(checked) => setValue("pagespeed.enabled", checked, { shouldDirty: true })}
              />
            </div>

            {pagespeedEnabled && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="pagespeed-api-key" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    API Key
                    {integrations?.pagespeed?.hasApiKey && (
                      <Badge variant="outline" className="text-xs">
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="pagespeed-api-key"
                      type={showApiKey ? "text" : "password"}
                      placeholder={integrations?.pagespeed?.hasApiKey ? integrations.pagespeed.apiKeyPreview || "API key configured" : "Enter your Google API key"}
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional: Provide a Google API key for higher rate limits.
                    Without a key, requests may be rate-limited.
                  </p>
                </div>

                <Alert>
                  <AlertDescription className="flex items-center justify-between">
                    <span className="text-sm">
                      Get a free API key from the Google Cloud Console
                    </span>
                    <a
                      href="https://developers.google.com/speed/docs/insights/v5/get-started#key"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-sm"
                    >
                      Get API Key
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </AlertDescription>
                </Alert>

                <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2">
                  <p className="font-medium">What you get with PageSpeed Insights:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Lighthouse scores (Performance, Accessibility, Best Practices, SEO)</li>
                    <li>Core Web Vitals (LCP, FID/INP, CLS)</li>
                    <li>Performance metrics (FCP, TTFB, Speed Index, TBT)</li>
                    <li>Threshold-based alerts when scores drop</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* More integrations can be added here */}

          {updateMutation.isError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to save integrations. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>
                Integrations saved successfully.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end pt-4">
            <LoadingButton
              type="submit"
              disabled={!isDirty && !apiKeyValue}
              isLoading={updateMutation.isPending}
              isSuccess={updateMutation.isSuccess}
              isError={updateMutation.isError}
              loadingText="Saving..."
              successText="Saved"
              errorText="Save Failed"
            >
              Save Changes
            </LoadingButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
