export type ApiChangelogEntry = {
    version: string;
    date: string;
    changes: string[];
    breaking?: boolean;
};

export type ApiDeprecationNotice = {
    id: string;
    description: string;
    endpoints: string[];
    sunsetAt?: string;
    replacement?: string;
    severity?: "info" | "warning" | "critical";
};

export const API_VERSIONS = {
    default: "1.0",
    latest: "1.1",
    supported: ["1.0", "1.1"],
    deprecated: [] as string[],
    preview: "2.0-beta",
    changelogUrl: "https://status.unified.sh/docs/api/changelog",
};

export const API_CHANGELOG: ApiChangelogEntry[] = [
    {
        version: "1.1",
        date: "2025-01-10",
        changes: [
            "Added GraphQL endpoint at /api/graphql for unified queries",
            "Introduced WebSocket subscriptions at /api/v1/ws alongside SSE",
            "Published API metadata endpoints for changelog and deprecation discovery",
            "Added version negotiation headers to prepare for v2 rollout",
        ],
    },
    {
        version: "1.0",
        date: "2025-12-01",
        changes: [
            "Stabilized REST resources under /api/v1/*",
            "Delivered SSE streaming at /api/v1/sse for monitor, dashboard, and status page updates",
        ],
    },
];

export const API_DEPRECATIONS: ApiDeprecationNotice[] = [
    {
        id: "incidents-status-string",
        description:
            "Legacy incident status strings will be replaced by enumerated status codes in v2.",
        endpoints: ["/api/v1/incidents", "/api/v1/events"],
        sunsetAt: "2025-06-30",
        replacement: "/api/v2/incidents (planned)",
        severity: "warning",
    },
    {
        id: "public-events-filters",
        description:
            "The legacy public events filter parameters will be renamed for consistency in v2.",
        endpoints: ["/api/public/events", "/api/public/status-pages/:slug/events"],
        sunsetAt: "2025-06-30",
        replacement: "Use GraphQL events query or REST v2 preview once available.",
        severity: "info",
    },
];

export function getVersionFromHeader(versionRaw?: string): string | null {
    if (!versionRaw) return null;
    const normalized = versionRaw.replace(/^v/i, "");
    if (API_VERSIONS.supported.includes(normalized)) return normalized;
    if (normalized === API_VERSIONS.preview) return normalized;
    return null;
}
