// Organization-level credential overrides for notification integrations
// These allow orgs to BYO (Bring Your Own) credentials instead of using platform defaults

export interface SmtpCredentials {
  host: string;
  port: number;
  username?: string;
  password?: string;
  fromAddress: string;
  fromName?: string;
  secure?: boolean;
  enabled: boolean;
}

export interface ResendCredentials {
  apiKey: string;
  fromAddress: string;
  enabled: boolean;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  enabled: boolean;
}

export interface NtfyCredentials {
  serverUrl?: string;
  username?: string;
  password?: string;
  enabled: boolean;
}

export interface IrcCredentials {
  defaultServer?: string;
  defaultPort?: number;
  defaultNickname?: string;
  defaultPassword?: string;
  useSsl?: boolean;
  enabled: boolean;
}

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  enabled: boolean;
}

export interface WebhookCredentials {
  defaultSigningKey?: string;
  enabled: boolean;
}

export interface OrganizationCredentials {
  smtp?: SmtpCredentials;
  resend?: ResendCredentials;
  twilio?: TwilioCredentials;
  ntfy?: NtfyCredentials;
  irc?: IrcCredentials;
  twitter?: TwitterCredentials;
  webhook?: WebhookCredentials;
}

// Masked versions for API responses (never expose actual secrets)
export interface MaskedSmtpCredentials {
  host: string;
  port: number;
  username?: string;
  hasPassword: boolean;
  fromAddress: string;
  fromName?: string;
  secure?: boolean;
  enabled: boolean;
}

export interface MaskedResendCredentials {
  apiKeyPreview: string; // Last 4 chars
  fromAddress: string;
  enabled: boolean;
}

export interface MaskedTwilioCredentials {
  accountSid: string;
  hasAuthToken: boolean;
  fromNumber: string;
  enabled: boolean;
}

export interface MaskedNtfyCredentials {
  serverUrl?: string;
  username?: string;
  hasPassword: boolean;
  enabled: boolean;
}

export interface MaskedIrcCredentials {
  defaultServer?: string;
  defaultPort?: number;
  defaultNickname?: string;
  hasPassword: boolean;
  useSsl?: boolean;
  enabled: boolean;
}

export interface MaskedTwitterCredentials {
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasAccessToken: boolean;
  hasAccessSecret: boolean;
  enabled: boolean;
}

export interface MaskedWebhookCredentials {
  hasSigningKey: boolean;
  enabled: boolean;
}

export interface MaskedOrganizationCredentials {
  smtp?: MaskedSmtpCredentials;
  resend?: MaskedResendCredentials;
  twilio?: MaskedTwilioCredentials;
  ntfy?: MaskedNtfyCredentials;
  irc?: MaskedIrcCredentials;
  twitter?: MaskedTwitterCredentials;
  webhook?: MaskedWebhookCredentials;
}
