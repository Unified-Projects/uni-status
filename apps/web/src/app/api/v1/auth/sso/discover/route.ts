import { NextRequest, NextResponse } from "next/server";
import { db, organizationDomains } from "@uni-status/database";
import { getEnabledGlobalProviders } from "@uni-status/auth/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email || !email.includes("@")) {
      return NextResponse.json({
        success: false,
        error: "Invalid email address",
      }, { status: 400 });
    }

    // Extract domain from email
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      return NextResponse.json({
        success: false,
        error: "Invalid email domain",
      }, { status: 400 });
    }

    // Check for organization-specific SSO via verified domain
    const domainConfig = await db.query.organizationDomains.findFirst({
      where: (organizationDomains, { and, eq }) =>
        and(
          eq(organizationDomains.domain, domain),
          eq(organizationDomains.verified, true)
        ),
      with: {
        organization: true,
      },
    });

    if (domainConfig?.organization) {
      // Check if this organization has SSO configured
      // Query the ssoProvider table for this organization
      const ssoProviders = await db.query.ssoProvider?.findMany({
        where: (ssoProvider, { eq }) => eq(ssoProvider.organizationId, domainConfig.organizationId),
      }) || [];

      if (ssoProviders.length > 0) {
        // Organization has SSO configured
        const provider = ssoProviders[0]; // Use first provider

        return NextResponse.json({
          success: true,
          data: {
            hasSSO: true,
            ssoRequired: true, // Organization SSO is typically required
            providerId: provider.providerId,
            providerName: provider.providerId.charAt(0).toUpperCase() + provider.providerId.slice(1),
            organizationName: domainConfig.organization.name,
            autoJoinEnabled: domainConfig.autoJoinEnabled,
            providerType: "sso", // This is an org-specific SSO provider
          },
        });
      }
    }

    // No organization-specific SSO found
    // Check for global OAuth providers (like Microsoft, Google, etc.)
    const globalProviders = getEnabledGlobalProviders();

    // For now, we don't auto-suggest global providers based on email domain
    // but we could add domain matching logic here (e.g., @microsoft.com -> Microsoft)

    return NextResponse.json({
      success: true,
      data: {
        hasSSO: false,
        ssoRequired: false,
        autoJoinEnabled: domainConfig?.autoJoinEnabled || false,
        organizationName: domainConfig?.organization?.name,
        globalProviders: globalProviders, // Available global OAuth providers
      },
    });
  } catch (error) {
    console.error("[SSO Discovery] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
}
