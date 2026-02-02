"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { Plus, Trash2, ExternalLink, RefreshCw, Copy, Check } from "lucide-react";
import {
    Button,
    Input,
    Label,
    Switch,
    Card,
    CardContent,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@uni-status/ui";
import { type AlertChannelType } from "./channel-type-icon";
import type { AlertChannel } from "@/lib/api-client";

const alertChannelFormSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    type: z.enum(["email", "slack", "discord", "teams", "pagerduty", "webhook", "sms", "ntfy", "irc", "twitter"]),
    enabled: z.boolean(),
    config: z.object({
        email: z.string().email("Invalid email address").optional().or(z.literal("")), // DEPRECATED - kept for backward compatibility
        fromAddress: z.string().email("Invalid email address").optional().or(z.literal("")),
        toAddresses: z.array(z.string().email("Invalid email address")).optional(),
        webhookUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
        routingKey: z.string().optional(),
        url: z.string().url("Invalid URL").optional().or(z.literal("")),
        method: z.enum(["GET", "POST"]).optional(),
        headers: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
        signingKey: z.string().min(32).max(256).optional().or(z.literal("")),
        phoneNumber: z.string().optional(),
        topic: z.string().optional(),
        server: z.string().url("Invalid server URL").optional().or(z.literal("")),
        channel: z.string().optional(),
    }),
});

type AlertChannelFormData = z.infer<typeof alertChannelFormSchema>;

// Form-specific type that ensures arrays are always present for useFieldArray
type AlertChannelFormValues = {
    name: string;
    type: "email" | "slack" | "discord" | "teams" | "pagerduty" | "webhook" | "sms" | "ntfy" | "irc" | "twitter";
    enabled: boolean;
    config: {
        email?: string | "";
        fromAddress?: string | "";
        toAddresses: string[];
        webhookUrl?: string | "";
        routingKey?: string;
        url?: string | "";
        method?: "GET" | "POST";
        headers: { key: string; value: string }[];
        signingKey?: string | "";
        phoneNumber?: string;
        topic?: string;
        server?: string | "";
        channel?: string;
    };
};

interface AlertChannelFormProps {
    /** Pre-selected channel type (required for create, inferred from channel for edit) */
    type?: AlertChannelType;
    channel?: AlertChannel;
    onSubmit: (data: AlertChannelFormData) => Promise<void>;
    onCancel?: () => void;
    isSubmitting?: boolean;
}

// Generate a cryptographically secure random signing key (client-side)
function generateSigningKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function AlertChannelForm({
    type: preSelectedType,
    channel,
    onSubmit,
    onCancel,
    isSubmitting = false,
}: AlertChannelFormProps) {
    const isEditMode = !!channel;
    const [signingKeyCopied, setSigningKeyCopied] = useState(false);

    // Determine the effective type: use channel type for edit, or pre-selected type for create
    const effectiveType = channel?.type as AlertChannelType ?? preSelectedType ?? "email";

    // Convert headers object to array for form
    const initialHeaders: { key: string; value: string }[] = channel?.config?.headers
        ? Object.entries(channel.config.headers).map(([key, value]) => ({ key, value }))
        : [];

    // Handle backward compatibility for email addresses
    const initialToAddresses: string[] = channel?.config?.toAddresses
        ? channel.config.toAddresses
        : channel?.config?.email
            ? [channel.config.email]
            : [""];

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        formState: { errors },
    } = useForm<AlertChannelFormValues>({
        resolver: zodResolver(alertChannelFormSchema) as any,
        defaultValues: {
            name: channel?.name ?? "",
            type: effectiveType,
            enabled: channel?.enabled ?? true,
            config: {
                email: channel?.config?.email ?? "",
                fromAddress: channel?.config?.fromAddress ?? "",
                toAddresses: initialToAddresses,
                webhookUrl: channel?.config?.webhookUrl ?? "",
                routingKey: channel?.config?.routingKey ?? "",
                url: channel?.config?.url ?? "",
                method: channel?.config?.method ?? "POST",
                headers: initialHeaders,
                signingKey: channel?.config?.signingKey ?? "",
                phoneNumber: channel?.config?.phoneNumber ?? "",
                topic: channel?.config?.topic ?? "",
                server: channel?.config?.server ?? "",
            },
        },
    });

    const { fields: toAddressFields, append: appendToAddress, remove: removeToAddress } = useFieldArray<AlertChannelFormValues>({
        control,
        name: "config.toAddresses" as any,
    }) as any;

    const { fields, append, remove } = useFieldArray<AlertChannelFormValues>({
        control,
        name: "config.headers",
    });

    const watchedType = watch("type");
    const watchedEnabled = watch("enabled");

    const handleFormSubmit = async (data: AlertChannelFormValues) => {
        // Convert headers array back to object for API
        const headersObj = data.config.headers?.reduce(
            (acc, { key, value }) => {
                if (key && value) acc[key] = value;
                return acc;
            },
            {} as Record<string, string>
        );

        // Clean up the config - remove empty strings and only keep relevant fields
        const cleanConfig = (config: typeof data.config) => {
            const cleaned: Record<string, unknown> = {};

            // Only include fields that are relevant to this channel type and have values
            for (const [key, value] of Object.entries(config)) {
                // Skip headers - we handle that separately
                if (key === "headers") continue;

                // Convert empty strings to undefined (skip them)
                if (value === "") continue;

                // Skip undefined/null values
                if (value === undefined || value === null) continue;

                cleaned[key] = value;
            }

            // Add cleaned headers if they exist
            if (headersObj && Object.keys(headersObj).length > 0) {
                cleaned.headers = headersObj;
            }

            return cleaned;
        };

        const cleanedData = {
            ...data,
            config: cleanConfig(data.config),
        };

        await onSubmit(cleanedData as unknown as AlertChannelFormData);
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            {/* Basic Settings */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                        id="name"
                        placeholder="My Alert Channel"
                        {...register("name")}
                    />
                    {errors.name && (
                        <p className="text-sm text-destructive">{errors.name.message}</p>
                    )}
                </div>

                <div className="flex items-center justify-between space-y-2 pt-6">
                    <div className="space-y-0.5">
                        <Label>Enabled</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive notifications via this channel
                        </p>
                    </div>
                    <Switch
                        checked={watchedEnabled}
                        onCheckedChange={(checked) => setValue("enabled", checked)}
                    />
                </div>
            </div>

            {/* Type-Specific Configuration */}
            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium">Configuration</h4>
                        {getHelpLink(watchedType) && (
                            <a
                                href={getHelpLink(watchedType)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                                How to set up
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </div>

                    {/* Email Config */}
                    {watchedType === "email" && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="config.fromAddress">From Address (Sender) *</Label>
                                <Input
                                    id="config.fromAddress"
                                    type="email"
                                    placeholder="alerts@yourdomain.com"
                                    {...register("config.fromAddress")}
                                />
                                {errors.config?.fromAddress && (
                                    <p className="text-sm text-destructive">{errors.config.fromAddress.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Email address that alerts will be sent FROM. Uses your SMTP credentials.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>To Addresses (Recipients) *</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => appendToAddress("")}
                                    >
                                        <Plus className="mr-1 h-3 w-3" />
                                        Add Recipient
                                    </Button>
                                </div>
                                {toAddressFields.length > 0 ? (
                                    <div className="space-y-2">
                                        {toAddressFields.map((field: any, index: number) => (
                                            <div key={field.id} className="flex items-center gap-2">
                                                <Input
                                                    type="email"
                                                    placeholder="recipient@example.com"
                                                    {...register(`config.toAddresses.${index}`)}
                                                />
                                                {toAddressFields.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeToAddress(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        {errors.config?.toAddresses && (
                                            <p className="text-sm text-destructive">
                                                {errors.config.toAddresses.message || "At least one valid email address is required"}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No recipients configured
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {/* Slack/Discord/Teams Config */}
                    {(watchedType === "slack" || watchedType === "discord" || watchedType === "teams") && (
                        <div className="space-y-2">
                            <Label htmlFor="config.webhookUrl">Webhook URL *</Label>
                            <Input
                                id="config.webhookUrl"
                                type="url"
                                placeholder={getWebhookPlaceholder(watchedType)}
                                {...register("config.webhookUrl")}
                            />
                            {errors.config?.webhookUrl && (
                                <p className="text-sm text-destructive">{errors.config.webhookUrl.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {getWebhookHelp(watchedType)}
                            </p>
                        </div>
                    )}

                    {/* PagerDuty Config */}
                    {watchedType === "pagerduty" && (
                        <div className="space-y-2">
                            <Label htmlFor="config.routingKey">Routing Key *</Label>
                            <Input
                                id="config.routingKey"
                                type="password"
                                placeholder="Enter your PagerDuty routing key"
                                {...register("config.routingKey")}
                            />
                            <p className="text-xs text-muted-foreground">
                                Find this in PagerDuty under Service &gt; Integrations &gt; Events API V2
                            </p>
                        </div>
                    )}

                    {/* Webhook Config */}
                    {watchedType === "webhook" && (
                        <>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="config.url">URL *</Label>
                                    <Input
                                        id="config.url"
                                        type="url"
                                        placeholder="https://api.example.com/webhook"
                                        {...register("config.url")}
                                    />
                                    {errors.config?.url && (
                                        <p className="text-sm text-destructive">{errors.config.url.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="config.method">Method</Label>
                                    <Select
                                        value={watch("config.method")}
                                        onValueChange={(value) => setValue("config.method", value as "GET" | "POST")}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="POST">POST</SelectItem>
                                            <SelectItem value="GET">GET</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Headers</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ key: "", value: "" })}
                                    >
                                        <Plus className="mr-1 h-3 w-3" />
                                        Add Header
                                    </Button>
                                </div>
                                {fields.length > 0 ? (
                                    <div className="space-y-2">
                                        {fields.map((field, index) => (
                                            <div key={field.id} className="flex items-center gap-2">
                                                <Input
                                                    placeholder="Header name"
                                                    {...register(`config.headers.${index}.key`)}
                                                />
                                                <Input
                                                    placeholder="Header value"
                                                    {...register(`config.headers.${index}.value`)}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No custom headers configured
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="config.signingKey">Signing Key (optional)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="config.signingKey"
                                        type="password"
                                        placeholder="Enter or generate a signing key"
                                        className="font-mono"
                                        {...register("config.signingKey")}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            setValue("config.signingKey", generateSigningKey());
                                        }}
                                        title="Generate new key"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            const key = watch("config.signingKey");
                                            if (key) {
                                                navigator.clipboard.writeText(key);
                                                setSigningKeyCopied(true);
                                                setTimeout(() => setSigningKeyCopied(false), 2000);
                                            }
                                        }}
                                        title="Copy to clipboard"
                                    >
                                        {signingKeyCopied ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                {errors.config?.signingKey && (
                                    <p className="text-sm text-destructive">{errors.config.signingKey.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    When set, requests include <code className="bg-muted px-1 rounded">X-Uni-Status-Signature</code> and{" "}
                                    <code className="bg-muted px-1 rounded">X-Uni-Status-Timestamp</code> headers for HMAC-SHA256 verification.
                                </p>
                            </div>
                        </>
                    )}

                    {/* SMS Config */}
                    {watchedType === "sms" && (
                        <div className="space-y-2">
                            <Label htmlFor="config.phoneNumber">Phone Number *</Label>
                            <Input
                                id="config.phoneNumber"
                                type="tel"
                                placeholder="+1234567890"
                                {...register("config.phoneNumber")}
                            />
                            <p className="text-xs text-muted-foreground">
                                Include country code (e.g., +1 for US)
                            </p>
                        </div>
                    )}

                    {/* Ntfy Config */}
                    {watchedType === "ntfy" && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="config.topic">Topic *</Label>
                                <Input
                                    id="config.topic"
                                    placeholder="my-alerts-topic"
                                    {...register("config.topic")}
                                />
                                <p className="text-xs text-muted-foreground">
                                    The ntfy topic to publish to
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="config.server">Server (optional)</Label>
                                <Input
                                    id="config.server"
                                    type="url"
                                    placeholder="https://ntfy.sh"
                                    {...register("config.server")}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Leave empty for ntfy.sh
                                </p>
                            </div>
                        </div>
                    )}

                    {/* IRC Config */}
                    {watchedType === "irc" && (
                        <div className="space-y-2">
                            <Label htmlFor="config.server">IRC Server URL *</Label>
                            <Input
                                id="config.server"
                                type="url"
                                placeholder="ircs://irc.libera.chat:6697"
                                {...register("config.server")}
                            />
                            {errors.config?.server && (
                                <p className="text-sm text-destructive">{errors.config.server.message}</p>
                            )}
                            <Label htmlFor="config.channel" className="mt-4 block">Channel *</Label>
                            <Input
                                id="config.channel"
                                placeholder="#alerts"
                                {...register("config.channel")}
                            />
                            <p className="text-xs text-muted-foreground">
                                IRC channel to post alerts to (include # prefix)
                            </p>
                        </div>
                    )}

                    {/* Twitter/X Config */}
                    {watchedType === "twitter" && (
                        <div className="space-y-2">
                            <Label htmlFor="config.webhookUrl">Webhook URL *</Label>
                            <Input
                                id="config.webhookUrl"
                                type="url"
                                placeholder="https://your-twitter-bot-webhook.example.com/..."
                                {...register("config.webhookUrl")}
                            />
                            {errors.config?.webhookUrl && (
                                <p className="text-sm text-destructive">{errors.config.webhookUrl.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                URL of your Twitter/X integration webhook endpoint
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-4">
                {onCancel && (
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                        ? isEditMode
                            ? "Saving..."
                            : "Creating..."
                        : isEditMode
                            ? "Save Changes"
                            : "Create Channel"}
                </Button>
            </div>
        </form>
    );
}

function getHelpLink(type: AlertChannelType): string | null {
    switch (type) {
        case "slack":
            return "https://api.slack.com/messaging/webhooks";
        case "discord":
            return "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks";
        case "teams":
            return "https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook";
        case "pagerduty":
            return "https://support.pagerduty.com/docs/services-and-integrations#create-a-generic-events-api-integration";
        case "ntfy":
            return "https://ntfy.sh/docs/";
        case "irc":
            return "https://libera.chat/guides/connect";
        case "twitter":
            return "https://developer.twitter.com/en/docs/twitter-api";
        default:
            return null;
    }
}

function getWebhookPlaceholder(type: AlertChannelType): string {
    switch (type) {
        case "slack":
            return "https://hooks.slack.com/services/.../.../...";
        case "discord":
            return "https://discord.com/api/webhooks/.../...";
        case "teams":
            return "https://xxxxx.webhook.office.com/webhookb2/...";
        default:
            return "https://...";
    }
}

function getWebhookHelp(type: AlertChannelType): string {
    switch (type) {
        case "slack":
            return "Create an Incoming Webhook in Slack: App settings > Incoming Webhooks > Add New Webhook";
        case "discord":
            return "Create a Webhook in Discord: Server Settings > Integrations > Webhooks > New Webhook";
        case "teams":
            return "Add a Webhook in Teams: Channel > Connectors > Incoming Webhook > Configure";
        default:
            return "";
    }
}
