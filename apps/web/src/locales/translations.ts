type TranslationValue = string | TranslationRecord;
export interface TranslationRecord {
  [key: string]: TranslationValue;
}

export const TRANSLATIONS: Record<string, TranslationRecord> = {
    en: {
        nav: {
            status: "Status",
            events: "Events",
            services: "Services",
        },
        overall: {
            operational: "All Systems Operational",
            operationalDesc: "All services are running normally",
            degraded: "Partial System Degradation",
            degradedDesc: "Some services are experiencing degraded performance",
            partialOutage: "Partial System Outage",
            partialOutageDesc: "Some services are currently unavailable",
            majorOutage: "Major System Outage",
            majorOutageDesc: "All services are currently unavailable",
            maintenance: "Under Maintenance",
            maintenanceDesc: "Services are undergoing scheduled maintenance",
        },
        common: {
            lastUpdated: "Last updated",
            viewAllEvents: "View all events",
            rss: "RSS",
            getSupport: "Get Support",
            poweredBy: "Powered by",
            language: "Language",
            timezone: "Timezone",
        },
        subscribe: {
            title: "Subscribe to Updates",
            description: "Get notified when there are changes to this status page.",
            placeholder: "Enter your email",
            button: "Subscribe",
            loading: "Subscribing...",
            success: "Verification email sent. Please check your inbox.",
            invalid: "Please enter your email address",
            error: "Failed to subscribe. Please try again.",
            genericError: "An error occurred. Please try again later.",
        },
        incidents: {
            started: "Started",
            resolved: "Resolved",
            description: "Description",
            affectedServices: "Affected Services",
            timeline: "Timeline",
            latestUpdate: "Latest Update",
            moreUpdates: "more updates",
            updatesLabel: "updates",
            status: {
                investigating: "Investigating",
                identified: "Identified",
                monitoring: "Monitoring",
                resolved: "Resolved",
                scheduled: "Scheduled",
            },
            severity: {
                minor: "Minor",
                major: "Major",
                critical: "Critical",
                maintenance: "Maintenance",
            },
        },
        events: {
            maintenance: "Maintenance",
            inProgress: "In Progress",
            completed: "Completed",
            duration: "Duration",
            ongoing: "ongoing",
            affected: "affected",
            service: "service",
            services: "services",
            downloadJson: "Download JSON",
            relatedDocuments: "Related Documents",
        },
        time: {
            justNow: "Just now",
            minutesAgo: "{value}m ago",
            hoursAgo: "{value}h ago",
            daysAgo: "{value}d ago",
            inMinutes: "in {value}m",
            inHours: "in {value}h",
            inDays: "in {value}d",
        },
    }
};
