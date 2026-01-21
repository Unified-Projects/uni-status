"use client";

import { useState } from "react";
import {
  Button,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@uni-status/ui";
import {
  Mail,
  Phone,
  Bell,
  MessageSquare,
  Webhook,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  TestTube2,
  Plus,
  Settings2,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useOrganizationCredentials,
  useUpdateCredentials,
  useDeleteCredential,
  useTestCredential,
} from "@/hooks/use-organizations";
import type { CredentialType } from "@uni-status/shared/validators";
import type {
  MaskedOrganizationCredentials,
  MaskedSmtpCredentials,
  MaskedResendCredentials,
  MaskedTwilioCredentials,
  MaskedNtfyCredentials,
  MaskedIrcCredentials,
  MaskedTwitterCredentials,
  MaskedWebhookCredentials,
} from "@uni-status/shared/types/credentials";
import { EmptyState } from "@/components/ui/empty-state";

// Credential type configuration
interface CredentialTypeConfig {
  type: CredentialType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const CREDENTIAL_TYPES: CredentialTypeConfig[] = [
  {
    type: "smtp",
    title: "SMTP",
    description: "Send alert emails through your own mail server",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    type: "resend",
    title: "Resend",
    description: "Send alert emails through Resend API",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    type: "twilio",
    title: "Twilio SMS",
    description: "Send SMS alerts through your own Twilio account",
    icon: <Phone className="h-5 w-5" />,
  },
  {
    type: "ntfy",
    title: "ntfy",
    description: "Use your own ntfy server for push notifications",
    icon: <Bell className="h-5 w-5" />,
  },
  {
    type: "irc",
    title: "IRC Defaults",
    description: "Set default IRC server settings for alert channels",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    type: "twitter",
    title: "Twitter/X",
    description: "Post alerts to Twitter or send DMs",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    type: "webhook",
    title: "Webhook Signing",
    description: "Set a default signing key for webhook notifications",
    icon: <Webhook className="h-5 w-5" />,
  },
];

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  hasValue,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hasValue?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={hasValue ? "********" : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// Type selector dialog
function CredentialTypeSelectorDialog({
  open,
  onOpenChange,
  onSelectType,
  configuredTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectType: (type: CredentialType) => void;
  configuredTypes: CredentialType[];
}) {
  const availableTypes = CREDENTIAL_TYPES.filter(
    (t) => !configuredTypes.includes(t.type)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Notification Credentials</DialogTitle>
          <DialogDescription>
            Select a notification provider to configure your own credentials
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-4">
          {availableTypes.map((config) => (
            <button
              key={config.type}
              type="button"
              onClick={() => {
                onSelectType(config.type);
                onOpenChange(false);
              }}
              className={cn(
                "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                "hover:border-primary hover:bg-primary/5",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "border-border"
              )}
            >
              <div className="text-muted-foreground">{config.icon}</div>
              <div className="flex-1 min-w-0">
                <span className="font-medium block truncate">{config.title}</span>
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {config.description}
                </span>
              </div>
            </button>
          ))}
        </div>
        {availableTypes.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            All credential types have been configured
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Credential configuration dialog
function CredentialConfigDialog({
  open,
  onOpenChange,
  type,
  credentials,
  onSave,
  onDelete,
  onTest,
  isSaving,
  isDeleting,
  isTesting,
  testResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CredentialType | null;
  credentials: MaskedOrganizationCredentials[CredentialType] | null;
  onSave: (type: CredentialType, data: Record<string, unknown>) => Promise<void>;
  onDelete: (type: CredentialType) => Promise<void>;
  onTest: (type: CredentialType) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const config = type ? CREDENTIAL_TYPES.find((t) => t.type === type) : null;
  const isConfigured = !!credentials;

  // Form states for each type
  const [smtpForm, setSmtpForm] = useState({
    host: "",
    port: "587",
    username: "",
    password: "",
    fromAddress: "",
    fromName: "",
    secure: false,
    enabled: true,
  });

  const [resendForm, setResendForm] = useState({
    apiKey: "",
    fromAddress: "",
    enabled: true,
  });

  const [twilioForm, setTwilioForm] = useState({
    accountSid: "",
    authToken: "",
    fromNumber: "",
    enabled: true,
  });

  const [ntfyForm, setNtfyForm] = useState({
    serverUrl: "",
    username: "",
    password: "",
    enabled: true,
  });

  const [ircForm, setIrcForm] = useState({
    defaultServer: "",
    defaultPort: "6667",
    defaultNickname: "",
    defaultPassword: "",
    useSsl: false,
    enabled: true,
  });

  const [twitterForm, setTwitterForm] = useState({
    apiKey: "",
    apiSecret: "",
    accessToken: "",
    accessSecret: "",
    enabled: true,
  });

  const [webhookForm, setWebhookForm] = useState({
    defaultSigningKey: "",
    enabled: true,
  });

  if (!type || !config) return null;

  const smtpCreds = type === "smtp" ? credentials as MaskedSmtpCredentials | null : null;
  const resendCreds = type === "resend" ? credentials as MaskedResendCredentials | null : null;
  const twilioCreds = type === "twilio" ? credentials as MaskedTwilioCredentials | null : null;
  const ntfyCreds = type === "ntfy" ? credentials as MaskedNtfyCredentials | null : null;
  const ircCreds = type === "irc" ? credentials as MaskedIrcCredentials | null : null;
  const twitterCreds = type === "twitter" ? credentials as MaskedTwitterCredentials | null : null;
  const webhookCreds = type === "webhook" ? credentials as MaskedWebhookCredentials | null : null;

  const handleSave = async () => {
    let data: Record<string, unknown> = {};

    switch (type) {
      case "smtp":
        data = {
          host: smtpForm.host || smtpCreds?.host,
          port: parseInt(smtpForm.port) || smtpCreds?.port || 587,
          username: smtpForm.username || smtpCreds?.username,
          password: smtpForm.password || undefined,
          fromAddress: smtpForm.fromAddress || smtpCreds?.fromAddress,
          fromName: smtpForm.fromName || smtpCreds?.fromName,
          secure: smtpForm.secure,
          enabled: smtpForm.enabled,
        };
        break;
      case "resend":
        data = {
          apiKey: resendForm.apiKey || undefined,
          fromAddress: resendForm.fromAddress || resendCreds?.fromAddress,
          enabled: resendForm.enabled,
        };
        break;
      case "twilio":
        data = {
          accountSid: twilioForm.accountSid || twilioCreds?.accountSid,
          authToken: twilioForm.authToken || undefined,
          fromNumber: twilioForm.fromNumber || twilioCreds?.fromNumber,
          enabled: twilioForm.enabled,
        };
        break;
      case "ntfy":
        data = {
          serverUrl: ntfyForm.serverUrl || ntfyCreds?.serverUrl,
          username: ntfyForm.username || ntfyCreds?.username,
          password: ntfyForm.password || undefined,
          enabled: ntfyForm.enabled,
        };
        break;
      case "irc":
        data = {
          defaultServer: ircForm.defaultServer || ircCreds?.defaultServer,
          defaultPort: parseInt(ircForm.defaultPort) || ircCreds?.defaultPort || 6667,
          defaultNickname: ircForm.defaultNickname || ircCreds?.defaultNickname,
          defaultPassword: ircForm.defaultPassword || undefined,
          useSsl: ircForm.useSsl,
          enabled: ircForm.enabled,
        };
        break;
      case "twitter":
        data = {
          apiKey: twitterForm.apiKey || undefined,
          apiSecret: twitterForm.apiSecret || undefined,
          accessToken: twitterForm.accessToken || undefined,
          accessSecret: twitterForm.accessSecret || undefined,
          enabled: twitterCreds?.enabled ?? twitterForm.enabled,
        };
        break;
      case "webhook":
        data = {
          defaultSigningKey: webhookForm.defaultSigningKey || undefined,
          enabled: webhookCreds?.enabled ?? webhookForm.enabled,
        };
        break;
    }

    await onSave(type, data);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await onDelete(type);
    setDeleteConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground">{config.icon}</div>
              <div>
                <DialogTitle>
                  {isConfigured ? `Edit ${config.title}` : `Configure ${config.title}`}
                </DialogTitle>
                <DialogDescription>{config.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* SMTP Form */}
            {type === "smtp" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder={String(smtpCreds?.host || "smtp.example.com")}
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm((prev) => ({ ...prev, host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      placeholder={String(smtpCreds?.port || "587")}
                      value={smtpForm.port}
                      onChange={(e) => setSmtpForm((prev) => ({ ...prev, port: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-username">Username</Label>
                    <Input
                      id="smtp-username"
                      placeholder={String(smtpCreds?.username || "user@example.com")}
                      value={smtpForm.username}
                      onChange={(e) => setSmtpForm((prev) => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">Password</Label>
                    <PasswordInput
                      id="smtp-password"
                      placeholder="SMTP password"
                      value={smtpForm.password}
                      onChange={(value) => setSmtpForm((prev) => ({ ...prev, password: value }))}
                      hasValue={!!smtpCreds?.hasPassword}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-address">From Address</Label>
                    <Input
                      id="smtp-from-address"
                      type="email"
                      placeholder={String(smtpCreds?.fromAddress || "alerts@example.com")}
                      value={smtpForm.fromAddress}
                      onChange={(e) => setSmtpForm((prev) => ({ ...prev, fromAddress: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-name">From Name (optional)</Label>
                    <Input
                      id="smtp-from-name"
                      placeholder={String(smtpCreds?.fromName || "Uni-Status Alerts")}
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm((prev) => ({ ...prev, fromName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="smtp-secure"
                      checked={smtpForm.secure}
                      onCheckedChange={(checked) => setSmtpForm((prev) => ({ ...prev, secure: checked }))}
                    />
                    <Label htmlFor="smtp-secure">Use TLS/SSL</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="smtp-enabled"
                      checked={smtpForm.enabled}
                      onCheckedChange={(checked) => setSmtpForm((prev) => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="smtp-enabled">Enabled</Label>
                  </div>
                </div>
              </>
            )}

            {/* Resend Form */}
            {type === "resend" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="resend-api-key">
                    API Key
                    {!!resendCreds?.apiKeyPreview && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {String(resendCreds.apiKeyPreview)}
                      </Badge>
                    )}
                  </Label>
                  <PasswordInput
                    id="resend-api-key"
                    placeholder="re_..."
                    value={resendForm.apiKey}
                    onChange={(value) => setResendForm((prev) => ({ ...prev, apiKey: value }))}
                    hasValue={!!resendCreds?.apiKeyPreview}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resend-from-address">From Address</Label>
                    <Input
                      id="resend-from-address"
                      type="email"
                      placeholder={String(resendCreds?.fromAddress || "alerts@yourdomain.com")}
                      value={resendForm.fromAddress}
                      onChange={(e) => setResendForm((prev) => ({ ...prev, fromAddress: e.target.value }))}
                    />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="resend-enabled"
                    checked={resendForm.enabled}
                    onCheckedChange={(checked) => setResendForm((prev) => ({ ...prev, enabled: checked }))}
                  />
                  <Label htmlFor="resend-enabled">Enabled</Label>
                </div>
              </>
            )}

            {/* Twilio Form */}
            {type === "twilio" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="twilio-sid">Account SID</Label>
                  <Input
                    id="twilio-sid"
                    placeholder={String(twilioCreds?.accountSid || "ACxxxxxxxx")}
                    value={twilioForm.accountSid}
                    onChange={(e) => setTwilioForm((prev) => ({ ...prev, accountSid: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twilio-token">Auth Token</Label>
                  <PasswordInput
                    id="twilio-token"
                    placeholder="Auth token"
                    value={twilioForm.authToken}
                    onChange={(value) => setTwilioForm((prev) => ({ ...prev, authToken: value }))}
                    hasValue={!!twilioCreds?.hasAuthToken}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twilio-from">From Number</Label>
                  <Input
                    id="twilio-from"
                    placeholder={String(twilioCreds?.fromNumber || "+1234567890")}
                    value={twilioForm.fromNumber}
                    onChange={(e) => setTwilioForm((prev) => ({ ...prev, fromNumber: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="twilio-enabled"
                    checked={twilioForm.enabled}
                    onCheckedChange={(checked) => setTwilioForm((prev) => ({ ...prev, enabled: checked }))}
                  />
                  <Label htmlFor="twilio-enabled">Enabled</Label>
                </div>
              </>
            )}

            {/* ntfy Form */}
            {type === "ntfy" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ntfy-server">Server URL (optional)</Label>
                  <Input
                    id="ntfy-server"
                    placeholder={String(ntfyCreds?.serverUrl || "https://ntfy.sh")}
                    value={ntfyForm.serverUrl}
                    onChange={(e) => setNtfyForm((prev) => ({ ...prev, serverUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the public ntfy.sh server
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ntfy-username">Username (optional)</Label>
                    <Input
                      id="ntfy-username"
                      placeholder={String(ntfyCreds?.username || "Username for auth")}
                      value={ntfyForm.username}
                      onChange={(e) => setNtfyForm((prev) => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ntfy-password">Password (optional)</Label>
                    <PasswordInput
                      id="ntfy-password"
                      placeholder="Password"
                      value={ntfyForm.password}
                      onChange={(value) => setNtfyForm((prev) => ({ ...prev, password: value }))}
                      hasValue={!!ntfyCreds?.hasPassword}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="ntfy-enabled"
                    checked={ntfyForm.enabled}
                    onCheckedChange={(checked) => setNtfyForm((prev) => ({ ...prev, enabled: checked }))}
                  />
                  <Label htmlFor="ntfy-enabled">Enabled</Label>
                </div>
              </>
            )}

            {/* IRC Form */}
            {type === "irc" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="irc-server">Default Server</Label>
                    <Input
                      id="irc-server"
                      placeholder={String(ircCreds?.defaultServer || "irc.example.com")}
                      value={ircForm.defaultServer}
                      onChange={(e) => setIrcForm((prev) => ({ ...prev, defaultServer: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="irc-port">Default Port</Label>
                    <Input
                      id="irc-port"
                      type="number"
                      placeholder={String(ircCreds?.defaultPort || "6667")}
                      value={ircForm.defaultPort}
                      onChange={(e) => setIrcForm((prev) => ({ ...prev, defaultPort: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="irc-nickname">Default Nickname</Label>
                    <Input
                      id="irc-nickname"
                      placeholder={String(ircCreds?.defaultNickname || "UniStatusBot")}
                      value={ircForm.defaultNickname}
                      onChange={(e) => setIrcForm((prev) => ({ ...prev, defaultNickname: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="irc-password">Default Password (optional)</Label>
                    <PasswordInput
                      id="irc-password"
                      placeholder="Server password"
                      value={ircForm.defaultPassword}
                      onChange={(value) => setIrcForm((prev) => ({ ...prev, defaultPassword: value }))}
                      hasValue={!!ircCreds?.hasPassword}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="irc-ssl"
                      checked={ircForm.useSsl}
                      onCheckedChange={(checked) => setIrcForm((prev) => ({ ...prev, useSsl: checked }))}
                    />
                    <Label htmlFor="irc-ssl">Use SSL</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="irc-enabled"
                      checked={ircForm.enabled}
                      onCheckedChange={(checked) => setIrcForm((prev) => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="irc-enabled">Enabled</Label>
                  </div>
                </div>
              </>
            )}

            {/* Twitter Form */}
            {type === "twitter" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="twitter-api-key">API Key</Label>
                    <PasswordInput
                      id="twitter-api-key"
                      placeholder="API Key"
                      value={twitterForm.apiKey}
                      onChange={(value) => setTwitterForm((prev) => ({ ...prev, apiKey: value }))}
                      hasValue={!!twitterCreds?.hasApiKey}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitter-api-secret">API Secret</Label>
                    <PasswordInput
                      id="twitter-api-secret"
                      placeholder="API Secret"
                      value={twitterForm.apiSecret}
                      onChange={(value) => setTwitterForm((prev) => ({ ...prev, apiSecret: value }))}
                      hasValue={!!twitterCreds?.hasApiSecret}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="twitter-access-token">Access Token</Label>
                    <PasswordInput
                      id="twitter-access-token"
                      placeholder="Access Token"
                      value={twitterForm.accessToken}
                      onChange={(value) => setTwitterForm((prev) => ({ ...prev, accessToken: value }))}
                      hasValue={!!twitterCreds?.hasAccessToken}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitter-access-secret">Access Secret</Label>
                    <PasswordInput
                      id="twitter-access-secret"
                      placeholder="Access Secret"
                      value={twitterForm.accessSecret}
                      onChange={(value) => setTwitterForm((prev) => ({ ...prev, accessSecret: value }))}
                      hasValue={!!twitterCreds?.hasAccessSecret}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="twitter-enabled"
                    checked={twitterForm.enabled}
                    onCheckedChange={(checked) => setTwitterForm((prev) => ({ ...prev, enabled: checked }))}
                  />
                  <Label htmlFor="twitter-enabled">Enabled</Label>
                </div>
              </>
            )}

            {/* Webhook Form */}
            {type === "webhook" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="webhook-signing-key">Default Signing Key</Label>
                  <PasswordInput
                    id="webhook-signing-key"
                    placeholder="HMAC-SHA256 signing key (min 32 chars)"
                    value={webhookForm.defaultSigningKey}
                    onChange={(value) => setWebhookForm((prev) => ({ ...prev, defaultSigningKey: value }))}
                    hasValue={!!webhookCreds?.hasSigningKey}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to sign webhook payloads with HMAC-SHA256. Per-channel keys override this default.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="webhook-enabled"
                    checked={webhookForm.enabled}
                    onCheckedChange={(checked) => setWebhookForm((prev) => ({ ...prev, enabled: checked }))}
                  />
                  <Label htmlFor="webhook-enabled">Enabled</Label>
                </div>
              </>
            )}

            {testResult && (
              <Alert variant={testResult.success ? "default" : "destructive"}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 flex-1">
              {isConfigured && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onTest(type)}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube2 className="h-4 w-4 mr-2" />
                    )}
                    Test
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Remove
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {config.title} Credentials</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove these credentials? Your notifications will fall back to platform defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Configured credential card
function CredentialCard({
  config,
  credentials,
  onEdit,
}: {
  config: CredentialTypeConfig;
  credentials?: MaskedOrganizationCredentials[CredentialType];
  onEdit: () => void;
}) {
  const isEnabled = credentials?.enabled !== false;

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50",
        isEnabled ? "border-border" : "border-border/50 opacity-60"
      )}
      onClick={onEdit}
    >
      <div className={cn(
        "p-2 rounded-lg",
        isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{config.title}</span>
          {isEnabled ? (
            <Badge variant="default" className="gap-1 text-xs bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Disabled
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{config.description}</p>
      </div>
      <Settings2 className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function CredentialsForm() {
  const { organizationId } = useOrganization();
  const { data: credentials, isLoading } = useOrganizationCredentials(organizationId || "");
  const updateCredentials = useUpdateCredentials();
  const deleteCredential = useDeleteCredential();
  const testCredential = useTestCredential();

  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<CredentialType | null>(null);
  const [testResults, setTestResults] = useState<Record<CredentialType, { success: boolean; message: string } | null>>({
    smtp: null,
    resend: null,
    twilio: null,
    ntfy: null,
    irc: null,
    twitter: null,
    webhook: null,
  });

  // Get configured credential types
  const configuredTypes = CREDENTIAL_TYPES.filter(
    (config) => credentials?.[config.type]
  );

  const handleSelectType = (type: CredentialType) => {
    setSelectedType(type);
    setConfigDialogOpen(true);
  };

  const handleEditCredential = (type: CredentialType) => {
    setSelectedType(type);
    setConfigDialogOpen(true);
  };

  const handleSave = async (type: CredentialType, data: Record<string, unknown>) => {
    if (!organizationId) return;

    setTestResults((prev) => ({ ...prev, [type]: null }));
    await updateCredentials.mutateAsync({
      orgId: organizationId,
      data: { [type]: data },
    });
  };

  const handleDelete = async (type: CredentialType) => {
    if (!organizationId) return;

    await deleteCredential.mutateAsync({
      orgId: organizationId,
      type,
    });
  };

  const handleTest = async (type: CredentialType) => {
    if (!organizationId) return;

    setTestResults((prev) => ({ ...prev, [type]: null }));

    try {
      const result = await testCredential.mutateAsync({
        orgId: organizationId,
        type,
      });
      setTestResults((prev) => ({ ...prev, [type]: result }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [type]: {
          success: false,
          message: error instanceof Error ? error.message : "Test failed",
        },
      }));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Notification Credentials
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Notification Credentials
              </CardTitle>
              <CardDescription>
                Configure your own credentials for notification services
              </CardDescription>
            </div>
            <Button onClick={() => setTypeSelectorOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Credentials
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configuredTypes.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No credentials configured"
              description="Add your own notification credentials to use custom providers instead of platform defaults."
              action={{
                label: "Add Credentials",
                onClick: () => setTypeSelectorOpen(true),
                icon: Plus,
              }}
            />
          ) : (
            <>
              <Alert className="mb-4">
                <AlertDescription>
                  Platform SMTP is always used for authentication emails. Your custom credentials only apply to alert notifications.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                {configuredTypes.map((config) => (
                  <CredentialCard
                    key={config.type}
                    config={config}
                    credentials={credentials?.[config.type]}
                    onEdit={() => handleEditCredential(config.type)}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CredentialTypeSelectorDialog
        open={typeSelectorOpen}
        onOpenChange={setTypeSelectorOpen}
        onSelectType={handleSelectType}
        configuredTypes={configuredTypes.map((c) => c.type)}
      />

      <CredentialConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        type={selectedType}
        credentials={selectedType ? credentials?.[selectedType] ?? null : null}
        onSave={handleSave}
        onDelete={handleDelete}
        onTest={handleTest}
        isSaving={updateCredentials.isPending}
        isDeleting={deleteCredential.isPending}
        isTesting={testCredential.isPending}
        testResult={selectedType ? testResults[selectedType] : null}
      />
    </>
  );
}
