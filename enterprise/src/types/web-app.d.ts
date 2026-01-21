declare module "@/stores/dashboard-store" {
  export type DashboardStoreState = {
    currentOrganizationId?: string | null;
  };

  export function useDashboardStore<T>(
    selector: (state: DashboardStoreState) => T
  ): T;
}

declare module "@/lib/api-client" {
  export type AuditAction = string;
  export type ResourceType = string;

  export interface AuditLog {
    id: string;
    organizationId: string;
    userId: string | null;
    action: AuditAction;
    resourceType: ResourceType;
    resourceId: string | null;
    resourceName: string | null;
    metadata: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      changes?: Array<{ field: string; from: unknown; to: unknown }>;
      reason?: string;
    };
    ipAddress: string | null;
    userAgent: string | null;
    requestId: string | null;
    createdAt: string;
    user?: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    } | null;
  }

  export interface AuditLogsListParams {
    action?: AuditAction;
    userId?: string;
    resourceType?: ResourceType;
    resourceId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }

  export interface AuditActionCount {
    action: AuditAction;
    count: number;
  }

  export interface AuditUserCount {
    userId: string | null;
    name: string | null;
    email: string | null;
    count: number;
  }

  export interface OrganizationRole {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    resolvedPermissions: string[];
    isSystem: boolean;
    color: string | null;
    icon?: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }

  export interface ApiKey {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt?: string | null;
  }

  export const apiClient: {
    organizations: {
      roles: {
        list: (orgId: string) => Promise<unknown>;
        get: (orgId: string, roleId: string) => Promise<unknown>;
        create: (orgId: string, data: unknown) => Promise<unknown>;
        update: (orgId: string, roleId: string, data: unknown) => Promise<unknown>;
        delete: (orgId: string, roleId: string) => Promise<unknown>;
        assignToMember: (orgId: string, memberId: string, roleId: string) => Promise<unknown>;
      };
    };
    auditLogs: {
      list: (params?: AuditLogsListParams, organizationId?: string) => Promise<unknown>;
      actions: (organizationId?: string) => Promise<unknown>;
      users: (organizationId?: string) => Promise<unknown>;
      export: (format: "json" | "csv", params?: { from?: string; to?: string }, organizationId?: string) => string;
    };
    analytics: {
      dashboard: (organizationId?: string) => Promise<unknown>;
      uptime: (params?: unknown, organizationId?: string) => Promise<unknown>;
      responseTimes: (monitorId: string, hours?: number, organizationId?: string) => Promise<unknown>;
    };
  };

  export const queryKeys: {
    organizations: {
      roles: (orgId: string) => readonly unknown[];
      role: (orgId: string, roleId: string) => readonly unknown[];
      members: (orgId: string) => readonly unknown[];
    };
    auditLogs: {
      list: (params?: AuditLogsListParams) => readonly unknown[];
      actions: () => readonly unknown[];
      users: () => readonly unknown[];
    };
    analytics: {
      dashboard: () => readonly unknown[];
      uptime: (params?: unknown) => readonly unknown[];
      responseTimes: (monitorId: string, hours?: number) => readonly unknown[];
    };
  };
}

declare module "@/hooks/use-audit-logs" {
  export function useExportAuditLogs(): {
    getExportUrl: (format: "json" | "csv", params?: { from?: string; to?: string }) => string;
  };
}
