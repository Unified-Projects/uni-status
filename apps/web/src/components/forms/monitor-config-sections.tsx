"use client";

import { useState } from "react";
import { UseFormReturn, useFieldArray } from "react-hook-form";
import { ChevronDown, ChevronUp, Plus, Trash2, Database, Mail, Server, Network, MessageSquare, Key } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Badge,
  cn,
} from "@uni-status/ui";

// Convert empty/NaN numeric inputs to undefined so hidden or optional fields don't block submission
const parseOptionalNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(numberValue as number) ? undefined : numberValue as number;
};

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  icon,
  defaultOpen = false,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-sm font-medium hover:text-foreground/80"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
          {badge !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {description && !isOpen && (
        <p className="text-xs text-muted-foreground pl-6">{description}</p>
      )}
      {isOpen && <div className="pl-6 space-y-4">{children}</div>}
    </div>
  );
}

// Form type for monitor configuration sections
// Uses 'any' to allow flexible field access for dynamic nested paths
// react-hook-form's strict path typing doesn't work well with deeply nested dynamic forms
type FormType = UseFormReturn<any>;

interface ConfigSectionProps {
  form: FormType;
}

const DNS_RECORD_TYPES = [
  { value: "A", label: "A (IPv4 Address)" },
  { value: "AAAA", label: "AAAA (IPv6 Address)" },
  { value: "CNAME", label: "CNAME (Canonical Name)" },
  { value: "TXT", label: "TXT (Text Record)" },
  { value: "MX", label: "MX (Mail Exchange)" },
  { value: "SRV", label: "SRV (Service)" },
  { value: "NS", label: "NS (Name Server)" },
  { value: "SOA", label: "SOA (Start of Authority)" },
  { value: "PTR", label: "PTR (Pointer)" },
] as const;

export function DNSConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue } = form;
  const resolvers = watch("config.dns.resolvers") || [];
  const propagationCheck = watch("config.dns.propagationCheck") ?? false;
  const resolverStrategy = watch("config.dns.resolverStrategy") ?? "any";

  return (
    <CollapsibleSection
      title="DNS Settings"
      description="Configure DNS lookup options"
      icon={<Network className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Record Type</Label>
          <Select
            value={watch("config.dns.recordType") ?? "A"}
            onValueChange={(v) => setValue("config.dns.recordType", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select record type" />
            </SelectTrigger>
            <SelectContent>
              {DNS_RECORD_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Type of DNS record to query
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dns-nameserver">Custom Nameserver (Optional)</Label>
          <Input
            id="dns-nameserver"
            placeholder="8.8.8.8 or dns.cloudflare.com"
            {...register("config.dns.nameserver")}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use default system DNS
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dns-expected">Expected Value (Optional)</Label>
          <Input
            id="dns-expected"
            placeholder="192.168.1.1 or expected response"
            {...register("config.dns.expectedValue")}
          />
          <p className="text-xs text-muted-foreground">
            Monitor fails if response doesn't contain this value
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Propagation Check</Label>
            <Switch
              checked={propagationCheck}
              onCheckedChange={(checked) => setValue("config.dns.propagationCheck", checked)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Compare answers across resolvers/regions to catch propagation drift.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label>Resolver Strategy</Label>
              <Select
                value={resolverStrategy}
                onValueChange={(v) => setValue("config.dns.resolverStrategy", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any (fastest)</SelectItem>
                  <SelectItem value="quorum">Quorum</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>DNSSEC Validation</Label>
                <Switch
                  checked={watch("config.dns.dnssecValidation") ?? false}
                  onCheckedChange={(checked) => setValue("config.dns.dnssecValidation", checked)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Requires a DoH resolver that returns the AD flag.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dns-doh">DoH Endpoint (DNS over HTTPS)</Label>
            <Input
              id="dns-doh"
              placeholder="https://dns.example.com/dns-query"
              {...register("config.dns.dohEndpoint")}
            />
            <p className="text-xs text-muted-foreground">
              Reachability + DNSSEC (AD flag) if supported.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dns-dot">DoT Endpoint (host[:port])</Label>
            <Input
              id="dns-dot"
              placeholder="1.1.1.1:853"
              {...register("config.dns.dotEndpoint")}
            />
            <p className="text-xs text-muted-foreground">
              TLS handshake is measured for DoT reachability.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Additional Resolvers (multi-region/anycast)</Label>
          <div className="space-y-2">
            {resolvers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add resolvers to perform propagation or anycast consistency checks.
              </p>
            )}
            {resolvers.map((resolver: any, index: number) => (
              <div key={index} className="grid gap-2 md:grid-cols-5 items-center">
                <Input
                  className="md:col-span-3"
                  placeholder="8.8.8.8 or https://dns.example.com/dns-query"
                  value={resolver.endpoint || ""}
                  onChange={(e) => {
                    const next = [...resolvers];
                    next[index] = { ...next[index], endpoint: e.target.value };
                    setValue("config.dns.resolvers", next);
                  }}
                />
                <Select
                  value={resolver.type || "udp"}
                  onValueChange={(v) => {
                    const next = [...resolvers];
                    next[index] = { ...next[index], type: v };
                    setValue("config.dns.resolvers", next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="doh">DoH</SelectItem>
                    <SelectItem value="dot">DoT</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Region (optional)"
                  value={resolver.region || ""}
                  onChange={(e) => {
                    const next = [...resolvers];
                    next[index] = { ...next[index], region: e.target.value };
                    setValue("config.dns.resolvers", next);
                  }}
                />
                <button
                  type="button"
                  className="text-destructive hover:underline text-sm"
                  onClick={() => {
                    const next = [...resolvers];
                    next.splice(index, 1);
                    setValue("config.dns.resolvers", next);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setValue("config.dns.resolvers", [
                  ...resolvers,
                  { endpoint: "", type: "udp" },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Resolver
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dns-regions">Region Targets (comma separated)</Label>
            <Input
              id="dns-regions"
              placeholder="us-east,eu-west"
              {...register("config.dns.regionTargetsInput")}
            />
            <p className="text-xs text-muted-foreground">
              Ensures at least one resolver per listed region returns data.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Anycast Consistency</Label>
              <Switch
                checked={watch("config.dns.anycastCheck") ?? false}
                onCheckedChange={(checked) => setValue("config.dns.anycastCheck", checked)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Fail if resolvers disagree (useful for anycast POP drift).
            </p>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "America/New_York", label: "America/New York" },
  { value: "America/Los_Angeles", label: "America/Los Angeles" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
];

export function HeartbeatConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue } = form;

  return (
    <CollapsibleSection
      title="Heartbeat Settings"
      description="Configure expected ping intervals"
      icon={<Server className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Heartbeat monitors wait for your service to ping them. If no ping is received
            within the expected interval + grace period, the monitor is marked as down.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="heartbeat-interval">Expected Interval (seconds)</Label>
            <Input
              id="heartbeat-interval"
              type="number"
              min={60}
              max={86400}
              placeholder="300"
              {...register("config.heartbeat.expectedInterval", { setValueAs: parseOptionalNumber })}
            />
            <p className="text-xs text-muted-foreground">
              How often you expect pings (60s - 24h)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="heartbeat-grace">Grace Period (seconds)</Label>
            <Input
              id="heartbeat-grace"
              type="number"
              min={0}
              max={3600}
              placeholder="60"
              {...register("config.heartbeat.gracePeriod", { setValueAs: parseOptionalNumber })}
            />
            <p className="text-xs text-muted-foreground">
              Extra time before marking as late (0 - 1h)
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select
            value={watch("config.heartbeat.timezone") ?? "UTC"}
            onValueChange={(v) => setValue("config.heartbeat.timezone", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSection>
  );
}

const DEFAULT_DB_PORTS: Record<string, number> = {
  database_postgres: 5432,
  database_mysql: 3306,
  database_mongodb: 27017,
  database_redis: 6379,
  database_elasticsearch: 9200,
};

interface DatabaseConfigSectionProps extends ConfigSectionProps {
  monitorType: string;
}

export function DatabaseConfigSection({ form, monitorType }: DatabaseConfigSectionProps) {
  const { register, watch, setValue } = form;
  const defaultPort = DEFAULT_DB_PORTS[monitorType] ?? 5432;
  const isRedis = monitorType === "database_redis";
  const isElasticsearch = monitorType === "database_elasticsearch";
  const isMongoDB = monitorType === "database_mongodb";

  return (
    <CollapsibleSection
      title="Database Connection"
      description="Configure database connection settings"
      icon={<Database className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Connection credentials are encrypted before storage. The probe will attempt
            to connect and optionally run a health check query.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="db-host">Host *</Label>
            <Input
              id="db-host"
              placeholder="localhost or db.example.com"
              {...register("config.database.host")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="db-port">Port</Label>
            <Input
              id="db-port"
              type="number"
              min={1}
              max={65535}
              placeholder={defaultPort.toString()}
              {...register("config.database.port", { setValueAs: parseOptionalNumber })}
            />
          </div>
        </div>

        {!isRedis && (
          <div className="space-y-2">
            <Label htmlFor="db-database">Database Name</Label>
            <Input
              id="db-database"
              placeholder={isMongoDB ? "admin" : "postgres"}
              {...register("config.database.database")}
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="db-username">Username</Label>
            <Input
              id="db-username"
              placeholder="db_user"
              {...register("config.database.username")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="db-password">Password</Label>
            <div className="relative">
              <Input
                id="db-password"
                type="password"
                placeholder="********"
                {...register("config.database.password")}
              />
              <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Encrypted before storage</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Use SSL/TLS</Label>
            <p className="text-xs text-muted-foreground">
              Encrypt the database connection
            </p>
          </div>
          <Switch
            checked={watch("config.database.ssl") ?? false}
            onCheckedChange={(checked) => setValue("config.database.ssl", checked)}
          />
        </div>

        {!isRedis && !isElasticsearch && (
          <>
            <CollapsibleSection
              title="Health Check Query"
              description="Optional query to validate database health"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="db-query">Query</Label>
                  <textarea
                    id="db-query"
                    placeholder={
                      isMongoDB
                        ? '{"ping": 1}'
                        : "SELECT 1 AS health_check"
                    }
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    {...register("config.database.query")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="db-expected-rows">Expected Row Count</Label>
                  <Input
                    id="db-expected-rows"
                    type="number"
                    min={0}
                    placeholder="1"
                    {...register("config.database.expectedRowCount", { setValueAs: parseOptionalNumber })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fail if query returns different number of rows
                  </p>
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}

const DEFAULT_EMAIL_PORTS: Record<string, number> = {
  smtp: 587,
  imap: 993,
  pop3: 995,
};

const AUTH_METHODS = [
  { value: "plain", label: "PLAIN" },
  { value: "login", label: "LOGIN" },
  { value: "cram-md5", label: "CRAM-MD5" },
];

interface EmailServerConfigSectionProps extends ConfigSectionProps {
  monitorType: string;
}

export function EmailServerConfigSection({ form, monitorType }: EmailServerConfigSectionProps) {
  const { register, watch, setValue } = form;
  const defaultPort = DEFAULT_EMAIL_PORTS[monitorType] ?? 587;
  const isSmtp = monitorType === "smtp";

  return (
    <CollapsibleSection
      title="Email Server Connection"
      description="Configure email server settings"
      icon={<Mail className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email-host">Host *</Label>
            <Input
              id="email-host"
              placeholder={isSmtp ? "smtp.example.com" : "imap.example.com"}
              {...register("config.emailServer.host")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-port">Port</Label>
            <Input
              id="email-port"
              type="number"
              min={1}
              max={65535}
              placeholder={defaultPort.toString()}
              {...register("config.emailServer.port", { setValueAs: parseOptionalNumber })}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Use TLS</Label>
              <p className="text-xs text-muted-foreground">
                Connect with TLS encryption
              </p>
            </div>
            <Switch
              checked={watch("config.emailServer.tls") ?? true}
              onCheckedChange={(checked) => setValue("config.emailServer.tls", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Use STARTTLS</Label>
              <p className="text-xs text-muted-foreground">
                Upgrade to TLS after connect
              </p>
            </div>
            <Switch
              checked={watch("config.emailServer.starttls") ?? false}
              onCheckedChange={(checked) => setValue("config.emailServer.starttls", checked)}
            />
          </div>
        </div>

        <CollapsibleSection title="Authentication" description="Optional login credentials">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email-username">Username</Label>
                <Input
                  id="email-username"
                  placeholder="user@example.com"
                  {...register("config.emailServer.username")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-password">Password</Label>
                <div className="relative">
                  <Input
                    id="email-password"
                    type="password"
                    placeholder="********"
                    {...register("config.emailServer.password")}
                  />
                  <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Authentication Method</Label>
              <Select
                value={watch("config.emailServer.authMethod") ?? "plain"}
                onValueChange={(v) => setValue("config.emailServer.authMethod", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTH_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </CollapsibleSection>
  );
}

export function GrpcConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue, control } = form;

  const { fields: metadataFields, append: appendMetadata, remove: removeMetadata } =
    useFieldArray({
      control,
      name: "config.grpc.metadataArray",
    });

  return (
    <CollapsibleSection
      title="gRPC Settings"
      description="Configure gRPC service health check"
      icon={<Server className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="grpc-service">Service Name *</Label>
          <Input
            id="grpc-service"
            placeholder="grpc.health.v1.Health"
            {...register("config.grpc.service")}
          />
          <p className="text-xs text-muted-foreground">
            Full service name (e.g., package.ServiceName)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="grpc-method">Method Name</Label>
          <Input
            id="grpc-method"
            placeholder="Check"
            {...register("config.grpc.method")}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for standard health check
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Use TLS</Label>
            <p className="text-xs text-muted-foreground">
              Connect with TLS encryption
            </p>
          </div>
          <Switch
            checked={watch("config.grpc.tls") ?? true}
            onCheckedChange={(checked) => setValue("config.grpc.tls", checked)}
          />
        </div>

        <CollapsibleSection title="Request Message (JSON)" description="Optional request payload">
          <div className="space-y-2">
            <textarea
              placeholder='{"service": ""}'
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              {...register("config.grpc.requestMessage")}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Metadata"
          description="Optional request metadata"
          badge={metadataFields.length || undefined}
        >
          <div className="space-y-2">
            {metadataFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="Key"
                  {...register(`config.grpc.metadataArray.${index}.key`)}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  {...register(`config.grpc.metadataArray.${index}.value`)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMetadata(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendMetadata({ key: "", value: "" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Metadata
            </Button>
          </div>
        </CollapsibleSection>
      </div>
    </CollapsibleSection>
  );
}

export function WebsocketConfigSection({ form }: ConfigSectionProps) {
  const { register, control } = form;

  const { fields: headerFields, append: appendHeader, remove: removeHeader } =
    useFieldArray({
      control,
      name: "config.websocket.headersArray",
    });

  return (
    <CollapsibleSection
      title="WebSocket Settings"
      description="Configure WebSocket connection test"
      icon={<MessageSquare className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <CollapsibleSection
          title="Headers"
          description="Optional connection headers"
          badge={headerFields.length || undefined}
        >
          <div className="space-y-2">
            {headerFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="Header name"
                  {...register(`config.websocket.headersArray.${index}.key`)}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  {...register(`config.websocket.headersArray.${index}.value`)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeHeader(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendHeader({ key: "", value: "" })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Header
            </Button>
          </div>
        </CollapsibleSection>

        <div className="space-y-2">
          <Label htmlFor="ws-send">Message to Send</Label>
          <Input
            id="ws-send"
            placeholder='{"type": "ping"}'
            {...register("config.websocket.sendMessage")}
          />
          <p className="text-xs text-muted-foreground">
            Optional message to send after connection
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ws-expect">Expected Response Pattern</Label>
          <Input
            id="ws-expect"
            placeholder="pong|ok"
            className="font-mono"
            {...register("config.websocket.expectMessage")}
          />
          <p className="text-xs text-muted-foreground">
            Regex pattern to match against response
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ws-timeout">Close Timeout (ms)</Label>
          <Input
            id="ws-timeout"
            type="number"
            min={1000}
            max={60000}
            placeholder="5000"
            {...register("config.websocket.closeTimeout", { setValueAs: parseOptionalNumber })}
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

const DEFAULT_PROTOCOL_PORTS: Record<string, number> = {
  ssh: 22,
  ldap: 389,
  rdp: 3389,
};

interface ProtocolConfigSectionProps extends ConfigSectionProps {
  monitorType: string;
}

export function ProtocolConfigSection({ form, monitorType }: ProtocolConfigSectionProps) {
  const { register, watch, setValue } = form;
  const defaultPort = DEFAULT_PROTOCOL_PORTS[monitorType] ?? 22;
  const isLdap = monitorType === "ldap";
  const isSsh = monitorType === "ssh";

  const protocolLabels: Record<string, string> = {
    ssh: "SSH",
    ldap: "LDAP",
    rdp: "RDP",
  };

  return (
    <CollapsibleSection
      title={`${protocolLabels[monitorType] || "Protocol"} Settings`}
      description={`Configure ${protocolLabels[monitorType]} connection`}
      icon={<Server className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="protocol-host">Host *</Label>
            <Input
              id="protocol-host"
              placeholder="server.example.com"
              {...register("config.protocol.host")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol-port">Port</Label>
            <Input
              id="protocol-port"
              type="number"
              min={1}
              max={65535}
              placeholder={defaultPort.toString()}
              {...register("config.protocol.port", { setValueAs: parseOptionalNumber })}
            />
          </div>
        </div>

        {isSsh && (
          <div className="space-y-2">
            <Label htmlFor="protocol-banner">Expected Banner Pattern</Label>
            <Input
              id="protocol-banner"
              placeholder="SSH-2.0"
              className="font-mono"
              {...register("config.protocol.expectBanner")}
            />
            <p className="text-xs text-muted-foreground">
              Regex to match against SSH banner (optional)
            </p>
          </div>
        )}

        {isLdap && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ldap-basedn">Base DN</Label>
              <Input
                id="ldap-basedn"
                placeholder="dc=example,dc=com"
                {...register("config.protocol.ldapBaseDn")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-filter">Search Filter</Label>
              <Input
                id="ldap-filter"
                placeholder="(objectClass=*)"
                {...register("config.protocol.ldapFilter")}
              />
            </div>
          </>
        )}

        <CollapsibleSection title="Authentication" description="Optional credentials">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="protocol-username">Username</Label>
              <Input
                id="protocol-username"
                placeholder={isLdap ? "cn=admin,dc=example,dc=com" : "admin"}
                {...register("config.protocol.username")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol-password">Password</Label>
              <div className="relative">
                <Input
                  id="protocol-password"
                  type="password"
                  placeholder="********"
                  {...register("config.protocol.password")}
                />
                <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </CollapsibleSection>
  );
}

const DEFAULT_BROKER_PORTS: Record<string, number> = {
  mqtt: 1883,
  amqp: 5672,
};

interface BrokerConfigSectionProps extends ConfigSectionProps {
  monitorType: string;
}

export function BrokerConfigSection({ form, monitorType }: BrokerConfigSectionProps) {
  const { register, watch, setValue } = form;
  const isMqtt = monitorType === "mqtt";
  const isAmqp = monitorType === "amqp";

  return (
    <CollapsibleSection
      title={`${isMqtt ? "MQTT" : "AMQP"} Broker Settings`}
      description={`Configure ${isMqtt ? "MQTT" : "RabbitMQ/AMQP"} connection`}
      icon={<MessageSquare className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="broker-username">Username</Label>
            <Input
              id="broker-username"
              placeholder={isAmqp ? "guest" : "mqtt_user"}
              {...register("config.broker.username")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="broker-password">Password</Label>
            <div className="relative">
              <Input
                id="broker-password"
                type="password"
                placeholder="********"
                {...register("config.broker.password")}
              />
              <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {isMqtt && (
          <div className="space-y-2">
            <Label htmlFor="broker-topic">Topic</Label>
            <Input
              id="broker-topic"
              placeholder="$SYS/broker/uptime"
              {...register("config.broker.topic")}
            />
            <p className="text-xs text-muted-foreground">
              Topic to subscribe to for health check
            </p>
          </div>
        )}

        {isAmqp && (
          <>
            <div className="space-y-2">
              <Label htmlFor="broker-vhost">Virtual Host</Label>
              <Input
                id="broker-vhost"
                placeholder="/"
                {...register("config.broker.vhost")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="broker-queue">Queue Name</Label>
              <Input
                id="broker-queue"
                placeholder="health_check_queue"
                {...register("config.broker.queue")}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Use TLS</Label>
            <p className="text-xs text-muted-foreground">
              Connect with TLS encryption
            </p>
          </div>
          <Switch
            checked={watch("config.broker.tls") ?? false}
            onCheckedChange={(checked) => setValue("config.broker.tls", checked)}
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

const TRACEROUTE_PROTOCOLS = [
  { value: "icmp", label: "ICMP (Default)" },
  { value: "udp", label: "UDP" },
  { value: "tcp", label: "TCP" },
];

export function TracerouteConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue } = form;

  return (
    <CollapsibleSection
      title="Traceroute Settings"
      description="Configure network path tracing"
      icon={<Network className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Traceroute monitors the network path to the target, identifying routing
            changes and latency issues along the way.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="trace-hops">Max Hops</Label>
            <Input
              id="trace-hops"
              type="number"
              min={1}
              max={64}
              placeholder="30"
              {...register("config.traceroute.maxHops", { setValueAs: parseOptionalNumber })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trace-timeout">Timeout per Hop (ms)</Label>
            <Input
              id="trace-timeout"
              type="number"
              min={1000}
              max={30000}
              placeholder="5000"
              {...register("config.traceroute.timeout", { setValueAs: parseOptionalNumber })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Protocol</Label>
          <Select
            value={watch("config.traceroute.protocol") ?? "icmp"}
            onValueChange={(v) => setValue("config.traceroute.protocol", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACEROUTE_PROTOCOLS.map((proto) => (
                <SelectItem key={proto.value} value={proto.value}>
                  {proto.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSection>
  );
}

interface PrometheusConfigSectionProps {
  form: FormType;
  monitorType: string;
}

export function PrometheusConfigSection({ form, monitorType }: PrometheusConfigSectionProps) {
  const { register, watch, setValue } = form;
  const isBlackbox = monitorType === "prometheus_blackbox";
  const isPromql = monitorType === "prometheus_promql";
  const isRemoteWrite = monitorType === "prometheus_remote_write";

  const currentStrategy = watch("config.prometheus.multiTargetStrategy") ?? "quorum";

  return (
    <div className="space-y-4">
      {isBlackbox && (
        <CollapsibleSection
          title="Blackbox Exporter"
          description="Probe a target using Prometheus blackbox exporter."
          defaultOpen
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="prom-exporter">Exporter URL</Label>
              <Input
                id="prom-exporter"
                placeholder="https://prom.example.com/blackbox"
                {...register("config.prometheus.exporterUrl")}
              />
              <p className="text-xs text-muted-foreground">
                Override organization default blackbox exporter (leave empty to use org embedded/Alloy).
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">Prefer Org Embedded/Alloy</p>
                <p className="text-xs text-muted-foreground">Use organization-level blackbox exporter when available.</p>
              </div>
              <Switch
                checked={watch("config.prometheus.preferOrgEmbedded") ?? false}
                onCheckedChange={(checked) => setValue("config.prometheus.preferOrgEmbedded", checked)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prom-module">Module</Label>
                <Input
                  id="prom-module"
                  placeholder="http_2xx"
                  {...register("config.prometheus.module")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prom-probe-path">Probe Path</Label>
                <Input
                  id="prom-probe-path"
                  placeholder="/probe"
                  {...register("config.prometheus.probePath")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prom-targets">Targets (one per line)</Label>
              <textarea
                id="prom-targets"
                className="w-full rounded-md border bg-background p-2 text-sm"
                rows={4}
                placeholder="https://service-a.example.com&#10;https://service-b.example.com"
                {...register("config.prometheus.targetsInput")}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to probe the main target field instead.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="prom-timeout">Probe Timeout (seconds)</Label>
                <Input
                  id="prom-timeout"
                  type="number"
                  min={1}
                  max={300}
                  placeholder="30"
                  {...register("config.prometheus.timeoutSeconds", { setValueAs: parseOptionalNumber })}
                />
              </div>
              <div className="space-y-2">
                <Label>Multi-target Strategy</Label>
                <Select
                  value={currentStrategy}
                  onValueChange={(v) => setValue("config.prometheus.multiTargetStrategy", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any success</SelectItem>
                    <SelectItem value="quorum">Quorum</SelectItem>
                    <SelectItem value="all">All must succeed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {isPromql && (
        <CollapsibleSection
          title="PromQL Query"
          description="Evaluate a PromQL expression directly."
          defaultOpen
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prom-prom-url">Prometheus URL</Label>
                <Input
                  id="prom-prom-url"
                  placeholder="https://prom.example.com"
                  {...register("config.prometheus.prometheusUrl")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prom-auth-token">Auth Token (optional)</Label>
                <Input
                  id="prom-auth-token"
                  placeholder="Bearer token"
                  {...register("config.prometheus.promql.authToken")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prom-query">PromQL Query</Label>
              <textarea
                id="prom-query"
                className="w-full rounded-md border bg-background p-2 font-mono text-sm"
                rows={4}
                placeholder={'avg(rate(http_requests_total{job="api",status!~"5.."}[5m]))'}
                {...register("config.prometheus.promql.query")}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="prom-lookback">Lookback (seconds)</Label>
                <Input
                  id="prom-lookback"
                  type="number"
                  min={30}
                  max={86400}
                  placeholder="300"
                  {...register("config.prometheus.promql.lookbackSeconds", { setValueAs: parseOptionalNumber })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prom-step">Step (seconds)</Label>
                <Input
                  id="prom-step"
                  type="number"
                  min={5}
                  max={3600}
                  placeholder="60"
                  {...register("config.prometheus.promql.stepSeconds", { setValueAs: parseOptionalNumber })}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {isRemoteWrite && (
        <CollapsibleSection
          title="Remote Write Ingestion"
          description="Accept metrics pushed from Prometheus remote_write."
          defaultOpen
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prom-region-label">Region Label</Label>
              <Input
                id="prom-region-label"
                placeholder="region"
                {...register("config.prometheus.remoteWrite.regionLabel")}
              />
              <p className="text-xs text-muted-foreground">Label key to map into monitor regions.</p>
            </div>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Thresholds & SLI"
        description="Control degraded vs down using metric thresholds or SLO targets."
        defaultOpen
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="prom-thresh-degraded">Degraded Threshold</Label>
            <Input
              id="prom-thresh-degraded"
              type="number"
              step="any"
              placeholder="e.g. 95"
              {...register("config.prometheus.thresholds.degraded", { setValueAs: parseOptionalNumber })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prom-thresh-down">Down Threshold</Label>
            <Input
              id="prom-thresh-down"
              type="number"
              step="any"
              placeholder="e.g. 90"
              {...register("config.prometheus.thresholds.down", { setValueAs: parseOptionalNumber })}
            />
          </div>
          <div className="space-y-2">
            <Label>Comparison</Label>
            <Select
              value={watch("config.prometheus.thresholds.comparison") ?? "gte"}
              onValueChange={(v) => setValue("config.prometheus.thresholds.comparison", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gte">Higher is healthier (&gt;=)</SelectItem>
                <SelectItem value="lte">Lower is healthier (&lt;=)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium text-sm">Normalize Percent</p>
              <p className="text-xs text-muted-foreground">Treat 0-1 values as percentages.</p>
            </div>
            <Switch
              checked={watch("config.prometheus.thresholds.normalizePercent") ?? false}
              onCheckedChange={(checked) => setValue("config.prometheus.thresholds.normalizePercent", checked)}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export function WebVitalsThresholdsSection({ form }: ConfigSectionProps) {
  const { register } = form;

  return (
    <CollapsibleSection
      title="Core Web Vitals Thresholds"
      description="Set custom thresholds for Core Web Vitals"
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Mark monitor as degraded when Core Web Vitals exceed these thresholds.
            Leave empty to use Google's recommended thresholds.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="lcp-threshold">LCP (ms)</Label>
            <Input
              id="lcp-threshold"
              type="number"
              min={0}
              placeholder="2500"
              {...register("config.pagespeed.webVitalsThresholds.lcp", { setValueAs: parseOptionalNumber })}
            />
            <p className="text-xs text-muted-foreground">
              Largest Contentful Paint
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fid-threshold">FID (ms)</Label>
            <Input
              id="fid-threshold"
              type="number"
              min={0}
              placeholder="100"
              {...register("config.pagespeed.webVitalsThresholds.fid", { setValueAs: parseOptionalNumber })}
            />
            <p className="text-xs text-muted-foreground">
              First Input Delay
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cls-threshold">CLS</Label>
            <Input
              id="cls-threshold"
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder="0.1"
              {...register("config.pagespeed.webVitalsThresholds.cls", { setValueAs: parseOptionalNumber })}
            />
            <p className="text-xs text-muted-foreground">
              Cumulative Layout Shift
            </p>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function EmailAuthConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue } = form;

  return (
    <CollapsibleSection
      title="Email Authentication Settings"
      description="Configure SPF/DKIM/DMARC checks"
      icon={<Mail className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Checks SPF, DKIM, and DMARC records for a domain to verify email
            authentication configuration. A score from 0-100 indicates overall
            authentication strength.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-auth-domain">Domain *</Label>
          <Input
            id="email-auth-domain"
            placeholder="example.com"
            {...register("config.emailAuth.domain")}
          />
          <p className="text-xs text-muted-foreground">
            Domain to check email authentication records for
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-auth-dkim-selectors">DKIM Selectors</Label>
          <Input
            id="email-auth-dkim-selectors"
            placeholder="google, default, selector1"
            {...register("config.emailAuth.dkimSelectorsInput")}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of DKIM selectors to check (leave empty to use common defaults)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-auth-nameserver">Custom Nameserver (Optional)</Label>
          <Input
            id="email-auth-nameserver"
            placeholder="8.8.8.8 or dns.cloudflare.com"
            {...register("config.emailAuth.nameserver")}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use default system DNS
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Validate Policy Strength</Label>
            <p className="text-xs text-muted-foreground">
              Fail if SPF/DMARC policies are weak or missing
            </p>
          </div>
          <Switch
            checked={watch("config.emailAuth.validatePolicy") ?? true}
            onCheckedChange={(checked) => setValue("config.emailAuth.validatePolicy", checked)}
          />
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">What gets checked:</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>SPF:</strong> Sender Policy Framework record and policy strength</li>
            <li><strong>DKIM:</strong> DomainKeys Identified Mail records for specified selectors</li>
            <li><strong>DMARC:</strong> Domain-based Message Authentication policy</li>
          </ul>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// Known AWS regions for status monitoring
const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-west-2", label: "EU (London)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
] as const;

// Known AWS services for status monitoring
const AWS_SERVICES = [
  { value: "EC2", label: "EC2 (Elastic Compute Cloud)" },
  { value: "S3", label: "S3 (Simple Storage Service)" },
  { value: "RDS", label: "RDS (Relational Database Service)" },
  { value: "Lambda", label: "Lambda" },
  { value: "DynamoDB", label: "DynamoDB" },
  { value: "CloudFront", label: "CloudFront" },
  { value: "ELB", label: "Elastic Load Balancing" },
  { value: "Route53", label: "Route 53" },
  { value: "SQS", label: "SQS (Simple Queue Service)" },
  { value: "SNS", label: "SNS (Simple Notification Service)" },
] as const;

// Known GCP products
const GCP_PRODUCTS = [
  { value: "compute", label: "Compute Engine" },
  { value: "cloud-storage", label: "Cloud Storage" },
  { value: "cloud-sql", label: "Cloud SQL" },
  { value: "cloud-functions", label: "Cloud Functions" },
  { value: "kubernetes-engine", label: "Google Kubernetes Engine" },
  { value: "bigquery", label: "BigQuery" },
  { value: "cloud-run", label: "Cloud Run" },
  { value: "pub-sub", label: "Pub/Sub" },
] as const;

// Known Azure services
const AZURE_SERVICES = [
  { value: "virtual-machines", label: "Virtual Machines" },
  { value: "storage-accounts", label: "Storage Accounts" },
  { value: "azure-sql", label: "Azure SQL Database" },
  { value: "app-service", label: "App Service" },
  { value: "azure-functions", label: "Azure Functions" },
  { value: "cosmos-db", label: "Cosmos DB" },
  { value: "aks", label: "Azure Kubernetes Service" },
] as const;

interface ExternalStatusConfigProps {
  form: FormType;
  monitorType: string;
}

export function ExternalStatusConfigSection({ form, monitorType }: ExternalStatusConfigProps) {
  const { register, watch, setValue } = form;

  const pollInterval = watch("config.externalStatus.pollIntervalSeconds") ?? 300;

  // Helper to toggle array values
  const toggleArrayValue = (path: string, value: string) => {
    const current = watch(path) || [];
    if (current.includes(value)) {
      setValue(path, current.filter((v: string) => v !== value));
    } else {
      setValue(path, [...current, value]);
    }
  };

  return (
    <CollapsibleSection
      title="External Status Settings"
      description="Configure external service monitoring"
      icon={<Server className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        {/* Poll Interval - common to all */}
        <div className="space-y-2">
          <Label htmlFor="poll-interval">Poll Interval (seconds)</Label>
          <Input
            id="poll-interval"
            type="number"
            min={60}
            max={3600}
            placeholder="300"
            {...register("config.externalStatus.pollIntervalSeconds", {
              valueAsNumber: true,
              setValueAs: parseOptionalNumber,
            })}
          />
          <p className="text-xs text-muted-foreground">
            How often to check the status (60-3600 seconds, default: 300)
          </p>
        </div>

        {/* AWS-specific config */}
        {monitorType === "external_aws" && (
          <>
            <div className="space-y-2">
              <Label>AWS Regions (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select specific regions to monitor. Leave empty to monitor all regions.
              </p>
              <div className="flex flex-wrap gap-2">
                {AWS_REGIONS.map((region) => {
                  const selected = (watch("config.externalStatus.aws.regions") || []).includes(region.value);
                  return (
                    <Badge
                      key={region.value}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayValue("config.externalStatus.aws.regions", region.value)}
                    >
                      {region.label}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>AWS Services (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select specific services to monitor. Leave empty to monitor all services.
              </p>
              <div className="flex flex-wrap gap-2">
                {AWS_SERVICES.map((service) => {
                  const selected = (watch("config.externalStatus.aws.services") || []).includes(service.value);
                  return (
                    <Badge
                      key={service.value}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayValue("config.externalStatus.aws.services", service.value)}
                    >
                      {service.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* GCP-specific config */}
        {monitorType === "external_gcp" && (
          <div className="space-y-2">
            <Label>GCP Products (Optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select specific products to monitor. Leave empty to monitor all products.
            </p>
            <div className="flex flex-wrap gap-2">
              {GCP_PRODUCTS.map((product) => {
                const selected = (watch("config.externalStatus.gcp.products") || []).includes(product.value);
                return (
                  <Badge
                    key={product.value}
                    variant={selected ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleArrayValue("config.externalStatus.gcp.products", product.value)}
                  >
                    {product.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Azure-specific config */}
        {monitorType === "external_azure" && (
          <div className="space-y-2">
            <Label>Azure Services (Optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select specific services to monitor. Leave empty to monitor all services.
            </p>
            <div className="flex flex-wrap gap-2">
              {AZURE_SERVICES.map((service) => {
                const selected = (watch("config.externalStatus.azure.services") || []).includes(service.value);
                return (
                  <Badge
                    key={service.value}
                    variant={selected ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleArrayValue("config.externalStatus.azure.services", service.value)}
                  >
                    {service.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Statuspage.io config */}
        {monitorType === "external_statuspage" && (
          <div className="space-y-2">
            <Label htmlFor="statuspage-url">Status Page Base URL</Label>
            <Input
              id="statuspage-url"
              placeholder="https://status.stripe.com"
              {...register("config.externalStatus.statuspage.baseUrl")}
            />
            <p className="text-xs text-muted-foreground">
              The base URL of the Statuspage.io status page (e.g., https://status.stripe.com)
            </p>
          </div>
        )}

        {/* Custom status config */}
        {monitorType === "external_custom" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="custom-url">Status API URL</Label>
              <Input
                id="custom-url"
                placeholder="https://status.example.com/api/v1/status"
                {...register("config.externalStatus.custom.statusUrl")}
              />
              <p className="text-xs text-muted-foreground">
                URL that returns JSON status data
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="json-path">JSONPath (Optional)</Label>
              <Input
                id="json-path"
                placeholder="$.status or $.data.status"
                {...register("config.externalStatus.custom.jsonPath")}
              />
              <p className="text-xs text-muted-foreground">
                JSONPath expression to extract status value from response
              </p>
            </div>
          </>
        )}

        {/* Info for pre-configured providers */}
        {["external_cloudflare", "external_okta", "external_auth0", "external_stripe", "external_twilio"].includes(monitorType) && (
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-sm text-muted-foreground">
              This provider uses pre-configured status endpoints. The monitor will automatically
              fetch and parse status from the official status page.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

// Aggregate Monitor Configuration
export function AggregateConfigSection({ form }: ConfigSectionProps) {
  const { register, watch, setValue } = form;
  const thresholdMode = watch("config.aggregate.thresholdMode") ?? "absolute";

  return (
    <CollapsibleSection
      title="Aggregate Settings"
      description="Configure how dependent monitor statuses are aggregated"
      icon={<Network className="h-4 w-4" />}
      defaultOpen={true}
    >
      <div className="space-y-4">
        {/* Threshold Mode Selection */}
        <div className="space-y-2">
          <Label>Threshold Mode</Label>
          <Select
            value={thresholdMode}
            onValueChange={(v) => setValue("config.aggregate.thresholdMode", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select threshold mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="absolute">Absolute Count</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose whether thresholds are based on absolute counts or percentages
          </p>
        </div>

        {/* Absolute Thresholds */}
        {thresholdMode === "absolute" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aggregate-degraded-count">Degraded Threshold</Label>
              <Input
                id="aggregate-degraded-count"
                type="number"
                min={1}
                placeholder="e.g., 1"
                {...register("config.aggregate.degradedThresholdCount", {
                  setValueAs: parseOptionalNumber,
                })}
              />
              <p className="text-xs text-muted-foreground">
                Number of degraded/down monitors to trigger degraded status
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aggregate-down-count">Down Threshold</Label>
              <Input
                id="aggregate-down-count"
                type="number"
                min={1}
                placeholder="e.g., 2"
                {...register("config.aggregate.downThresholdCount", {
                  setValueAs: parseOptionalNumber,
                })}
              />
              <p className="text-xs text-muted-foreground">
                Number of down monitors to trigger down status
              </p>
            </div>
          </div>
        )}

        {/* Percentage Thresholds */}
        {thresholdMode === "percentage" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aggregate-degraded-percent">Degraded Threshold (%)</Label>
              <Input
                id="aggregate-degraded-percent"
                type="number"
                min={1}
                max={100}
                placeholder="e.g., 25"
                {...register("config.aggregate.degradedThresholdPercent", {
                  setValueAs: parseOptionalNumber,
                })}
              />
              <p className="text-xs text-muted-foreground">
                Percentage of degraded/down monitors to trigger degraded status
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aggregate-down-percent">Down Threshold (%)</Label>
              <Input
                id="aggregate-down-percent"
                type="number"
                min={1}
                max={100}
                placeholder="e.g., 50"
                {...register("config.aggregate.downThresholdPercent", {
                  setValueAs: parseOptionalNumber,
                })}
              />
              <p className="text-xs text-muted-foreground">
                Percentage of down monitors to trigger down status
              </p>
            </div>
          </div>
        )}

        {/* Options */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Count Degraded as Down</Label>
            <Switch
              checked={watch("config.aggregate.countDegradedAsDown") ?? false}
              onCheckedChange={(checked) => setValue("config.aggregate.countDegradedAsDown", checked)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            If enabled, degraded monitors will be counted toward the down threshold
          </p>
        </div>

        {/* Note about dependencies */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Configure which monitors to aggregate using the Dependencies section below.
            The aggregate status will be calculated based on all upstream dependencies.
          </p>
        </div>
      </div>
    </CollapsibleSection>
  );
}

export const MONITOR_TYPE_GROUPS = [
  {
    label: "Web",
    types: [
      { value: "https", label: "HTTPS" },
      { value: "http", label: "HTTP" },
      { value: "ssl", label: "SSL Certificate" },
    ],
  },
  {
    label: "Network",
    types: [
      { value: "tcp", label: "TCP Port" },
      { value: "ping", label: "Ping" },
      { value: "dns", label: "DNS" },
      { value: "traceroute", label: "Traceroute" },
    ],
  },
  {
    label: "Database",
    types: [
      { value: "database_postgres", label: "PostgreSQL" },
      { value: "database_mysql", label: "MySQL" },
      { value: "database_mongodb", label: "MongoDB" },
      { value: "database_redis", label: "Redis" },
      { value: "database_elasticsearch", label: "Elasticsearch" },
    ],
  },
  {
    label: "Email",
    types: [
      { value: "smtp", label: "SMTP" },
      { value: "imap", label: "IMAP" },
      { value: "pop3", label: "POP3" },
      { value: "email_auth", label: "Email Auth (SPF/DKIM/DMARC)" },
    ],
  },
  {
    label: "Messaging",
    types: [
      { value: "grpc", label: "gRPC" },
      { value: "websocket", label: "WebSocket" },
      { value: "mqtt", label: "MQTT" },
      { value: "amqp", label: "AMQP (RabbitMQ)" },
    ],
  },
  {
    label: "Remote Access",
    types: [
      { value: "ssh", label: "SSH" },
      { value: "ldap", label: "LDAP" },
      { value: "rdp", label: "RDP" },
    ],
  },
  {
    label: "Jobs & Crons",
    types: [{ value: "heartbeat", label: "Heartbeat" }],
  },
  {
    label: "Metrics",
    types: [
      { value: "prometheus_blackbox", label: "Prometheus Blackbox" },
      { value: "prometheus_promql", label: "Prometheus PromQL" },
      { value: "prometheus_remote_write", label: "Prometheus Remote Write" },
    ],
  },
  {
    label: "External Services",
    types: [
      { value: "external_aws", label: "AWS Status" },
      { value: "external_gcp", label: "Google Cloud Status" },
      { value: "external_azure", label: "Azure Status" },
      { value: "external_cloudflare", label: "Cloudflare Status" },
      { value: "external_okta", label: "Okta Status" },
      { value: "external_auth0", label: "Auth0 Status" },
      { value: "external_stripe", label: "Stripe Status" },
      { value: "external_twilio", label: "Twilio Status" },
      { value: "external_statuspage", label: "Statuspage.io" },
      { value: "external_custom", label: "Custom Status Page" },
    ],
  },
  {
    label: "Advanced",
    types: [
      { value: "aggregate", label: "Aggregate" },
    ],
  },
] as const;

// Flatten for easy lookup
export const ALL_MONITOR_TYPES = MONITOR_TYPE_GROUPS.flatMap((g) => [...g.types]);

// Get label for a monitor type
export function getMonitorTypeLabel(type: string): string {
  for (const group of MONITOR_TYPE_GROUPS) {
    const found = group.types.find((t) => t.value === type);
    if (found) return found.label;
  }
  return type;
}

// URL/Host input configuration based on type
export function getUrlInputConfig(type: string): {
  label: string;
  placeholder: string;
  hint: string;
} {
  switch (type) {
    case "heartbeat":
      return {
        label: "Identifier",
        placeholder: "my-cron-job",
        hint: "Unique name for this heartbeat monitor",
      };
    case "database_postgres":
    case "database_mysql":
      return {
        label: "Host",
        placeholder: "db.example.com",
        hint: "Database server hostname (port configured below)",
      };
    case "database_mongodb":
      return {
        label: "Host",
        placeholder: "mongo.example.com",
        hint: "MongoDB server hostname",
      };
    case "database_redis":
      return {
        label: "Host",
        placeholder: "redis.example.com",
        hint: "Redis server hostname",
      };
    case "database_elasticsearch":
      return {
        label: "Host",
        placeholder: "elasticsearch.example.com",
        hint: "Elasticsearch server hostname",
      };
    case "smtp":
    case "imap":
    case "pop3":
      return {
        label: "Host",
        placeholder: `${type}.example.com`,
        hint: "Email server hostname",
      };
    case "grpc":
      return {
        label: "Host:Port",
        placeholder: "api.example.com:443",
        hint: "gRPC server endpoint",
      };
    case "websocket":
      return {
        label: "WebSocket URL",
        placeholder: "wss://example.com/ws",
        hint: "WebSocket endpoint URL (ws:// or wss://)",
      };
    case "ssh":
    case "ldap":
    case "rdp":
      return {
        label: "Host",
        placeholder: "server.example.com",
        hint: `${type.toUpperCase()} server hostname`,
      };
    case "mqtt":
    case "amqp":
      return {
        label: "Host:Port",
        placeholder: type === "mqtt" ? "broker.example.com:1883" : "rabbitmq.example.com:5672",
        hint: `${type === "mqtt" ? "MQTT" : "AMQP"} broker address`,
      };
    case "traceroute":
      return {
        label: "Hostname/IP",
        placeholder: "example.com or 192.168.1.1",
        hint: "Target to trace route to",
      };
    case "prometheus_blackbox":
      return {
        label: "Target",
        placeholder: "https://example.com",
        hint: "Target URL/host the blackbox exporter will probe",
      };
    case "prometheus_promql":
      return {
        label: "Identifier",
        placeholder: "service-latency",
        hint: "Friendly name for this PromQL monitor",
      };
    case "prometheus_remote_write":
      return {
        label: "Identifier",
        placeholder: "api-errors",
        hint: "Friendly name for this remote write stream",
      };
    case "dns":
      return {
        label: "Domain",
        placeholder: "example.com",
        hint: "Domain name to query",
      };
    case "email_auth":
      return {
        label: "Domain",
        placeholder: "example.com",
        hint: "Domain to check SPF/DKIM/DMARC records",
      };
    case "tcp":
      return {
        label: "Host:Port",
        placeholder: "example.com:443",
        hint: "Target host and port to check",
      };
    case "ping":
      return {
        label: "Hostname/IP",
        placeholder: "example.com or 192.168.1.1",
        hint: "Target to ping",
      };
    case "ssl":
      return {
        label: "Hostname",
        placeholder: "example.com",
        hint: "Domain to check SSL certificate",
      };
    // External status provider types
    case "external_aws":
      return {
        label: "Identifier",
        placeholder: "aws-status",
        hint: "Name for this AWS status monitor",
      };
    case "external_gcp":
      return {
        label: "Identifier",
        placeholder: "gcp-status",
        hint: "Name for this Google Cloud status monitor",
      };
    case "external_azure":
      return {
        label: "Identifier",
        placeholder: "azure-status",
        hint: "Name for this Azure status monitor",
      };
    case "external_cloudflare":
      return {
        label: "Identifier",
        placeholder: "cloudflare-status",
        hint: "Name for this Cloudflare status monitor",
      };
    case "external_okta":
      return {
        label: "Identifier",
        placeholder: "okta-status",
        hint: "Name for this Okta status monitor",
      };
    case "external_auth0":
      return {
        label: "Identifier",
        placeholder: "auth0-status",
        hint: "Name for this Auth0 status monitor",
      };
    case "external_stripe":
      return {
        label: "Identifier",
        placeholder: "stripe-status",
        hint: "Name for this Stripe status monitor",
      };
    case "external_twilio":
      return {
        label: "Identifier",
        placeholder: "twilio-status",
        hint: "Name for this Twilio status monitor",
      };
    case "external_statuspage":
      return {
        label: "Status Page URL",
        placeholder: "https://status.example.com",
        hint: "Base URL of the Statuspage.io page",
      };
    case "external_custom":
      return {
        label: "Status URL",
        placeholder: "https://status.example.com/api/status",
        hint: "URL that returns status JSON",
      };
    case "aggregate":
      return {
        label: "Identifier",
        placeholder: "service-health",
        hint: "Friendly name for this aggregate monitor",
      };
    default:
      return {
        label: "URL",
        placeholder: "https://example.com",
        hint: "Enter the URL to monitor",
      };
  }
}

// Default ports for monitors that need them
export const DEFAULT_PORTS: Record<string, number> = {
  database_postgres: 5432,
  database_mysql: 3306,
  database_mongodb: 27017,
  database_redis: 6379,
  database_elasticsearch: 9200,
  smtp: 587,
  imap: 993,
  pop3: 995,
  ssh: 22,
  ldap: 389,
  rdp: 3389,
  mqtt: 1883,
  amqp: 5672,
  grpc: 443,
};
