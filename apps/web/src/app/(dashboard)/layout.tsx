import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@uni-status/auth/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { LicenseStatusBannerWrapper } from "@/components/banners";
import { getAppUrl, isSelfHosted } from "@uni-status/shared/config";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const requestHeaders = await headers();

    const session = await auth.api
        .getSession({
            headers: requestHeaders,
        })
        .catch((error) => {
            console.error("[dashboard-layout] Failed to fetch session", error);
            return null;
        });

    if (!session?.user) {
        redirect("/login");
    }

    // Check if user has any organisations and redirect to setup if none
    const orgsResponse = await auth.api
        .listOrganizations({
            headers: requestHeaders,
        })
        .catch((error) => {
            console.error("[dashboard-layout] Failed to fetch organizations", error);
            return null;
        });

    const organizations = Array.isArray(orgsResponse)
        ? orgsResponse
        : (orgsResponse as any)?.data ?? [];

    if (!organizations || organizations.length === 0) {
        // In self-hosted mode, check if user is pending approval before redirecting
        // to org setup (which they shouldn't be able to access)
        if (isSelfHosted()) {
            try {
                const appUrl = getAppUrl();
                const cookieHeader = requestHeaders.get("cookie") || "";
                const approvalResponse = await fetch(`${appUrl}/api/v1/pending-approvals/me`, {
                    headers: {
                        cookie: cookieHeader,
                    },
                });
                const approval = await approvalResponse.json();

                if (approval?.data?.hasPendingApproval || approval?.data?.status === "pending") {
                    redirect("/pending-approval");
                }
                // If rejected or no pending approval and not a member, they need admin attention
                if (approval?.data?.status === "rejected") {
                    redirect("/pending-approval");
                }
            } catch (error) {
                console.error("[dashboard-layout] Failed to check pending approval status", error);
            }
        }
        redirect("/setup-organisation");
    }

    return (
        <div className="fixed inset-0 flex overflow-hidden">
            <DashboardNav user={session.user} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <LicenseStatusBannerWrapper />
                <main className="flex-1 overflow-auto">
                    <div className="container mx-auto p-6">{children}</div>
                </main>
            </div>
        </div>
    );
}
