"use client";

import { useState } from "react";
import {
  Building2,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  FileText,
  Activity,
  Globe,
  Users,
  BarChart3,
  Shield,
  Lock,
  Map,
  Zap,
  Download,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
  AlertTitle,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Separator,
} from "@uni-status/ui";
import {
  useBillingLicense,
  useBillingInvoices,
  useBillingPlans,
  useBillingUsage,
  useBillingPortal,
  useCheckoutUrl,
  formatCurrency,
  formatBillingDate,
  type Plan,
  type Invoice,
} from "../../hooks/use-billing";

const PLAN_ORDER = ["free", "pro", "business", "enterprise"];

export function BillingTab() {
  const { data: license, isLoading: licenseLoading } = useBillingLicense();
  const { data: usage, isLoading: usageLoading } = useBillingUsage();
  const { data: plans, isLoading: plansLoading } = useBillingPlans();
  const { data: invoicesData, isLoading: invoicesLoading } = useBillingInvoices({ limit: 10 });
  const { data: portalData, isLoading: portalLoading } = useBillingPortal();

  const isLoading = licenseLoading || usageLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = license?.plan || "free";
  const sortedPlans = plans?.sort(
    (a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id)
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <CurrentPlanCard license={license} portalUrl={portalData?.url} />

          {license?.gracePeriod?.status === "active" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Payment Required</AlertTitle>
              <AlertDescription>
                Your subscription has payment issues. You have{" "}
                {license.gracePeriod.daysRemaining} day(s) to resolve this before
                being downgraded to the free plan.
                {portalData?.url && (
                  <Button variant="link" className="h-auto p-0 ml-2" asChild>
                    <a href={portalData.url} target="_blank" rel="noopener noreferrer">
                      Update payment method
                    </a>
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {currentPlan === "free" && (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertTitle>Upgrade to unlock more features</AlertTitle>
              <AlertDescription>
                Get more monitors, advanced alerting, and premium support with our Pro plan.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <UsageCard usage={usage} license={license} />
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-6">
          <InvoicesCard
            invoices={invoicesData?.invoices}
            isLoading={invoicesLoading}
          />
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-6">
          <PlansGrid
            plans={sortedPlans}
            currentPlan={currentPlan}
            isLoading={plansLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CurrentPlanCard({
  license,
  portalUrl,
}: {
  license: ReturnType<typeof useBillingLicense>["data"];
  portalUrl?: string;
}) {
  const planColors: Record<string, string> = {
    free: "bg-gray-100 dark:bg-gray-800",
    pro: "bg-blue-100 dark:bg-blue-900/30",
    business: "bg-purple-100 dark:bg-purple-900/30",
    enterprise: "bg-amber-100 dark:bg-amber-900/30",
  };

  const planDisplayNames: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    business: "Business",
    enterprise: "Enterprise",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Plan</CardTitle>
        <CardDescription>
          Your organization's subscription details
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                planColors[license?.plan || "free"]
              }`}
            >
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">
                {planDisplayNames[license?.plan || "free"]} Plan
              </p>
              <p className="text-sm text-muted-foreground">
                {license?.status === "active" && "Your subscription is active"}
                {license?.status === "grace_period" && "Payment required"}
                {license?.status === "downgraded" && "Downgraded from paid plan"}
                {(!license?.status || license?.status === "no_license") &&
                  "Free tier - upgrade for more features"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                license?.status === "active"
                  ? "default"
                  : license?.status === "grace_period"
                    ? "secondary"
                    : "outline"
              }
            >
              {license?.status === "active" && "Active"}
              {license?.status === "grace_period" && "Grace Period"}
              {license?.status === "downgraded" && "Downgraded"}
              {(!license?.status || license?.status === "no_license") && "Free"}
            </Badge>
          </div>
        </div>

        {license?.license && (
          <div className="grid grid-cols-2 gap-4 text-sm p-4 border rounded-lg">
            {license.license.expiresAt && (
              <div>
                <p className="text-muted-foreground">Next billing date</p>
                <p className="font-medium">
                  {formatBillingDate(license.license.expiresAt)}
                </p>
              </div>
            )}
            {license.license.createdAt && (
              <div>
                <p className="text-muted-foreground">Member since</p>
                <p className="font-medium">
                  {formatBillingDate(license.license.createdAt)}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {portalUrl && (
            <Button variant="outline" asChild>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Subscription
                <ExternalLink className="h-3 w-3 ml-2" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UsageCard({
  usage,
  license,
}: {
  usage: ReturnType<typeof useBillingUsage>["data"];
  license: ReturnType<typeof useBillingLicense>["data"];
}) {
  if (!usage) return null;

  const resourceItems = [
    {
      name: "Monitors",
      icon: Activity,
      used: usage.usage.monitors.used,
      limit: usage.usage.monitors.limit,
      unlimited: usage.usage.monitors.unlimited,
      percent: usage.usage.monitors.percentUsed,
    },
    {
      name: "Status Pages",
      icon: Globe,
      used: usage.usage.statusPages.used,
      limit: usage.usage.statusPages.limit,
      unlimited: usage.usage.statusPages.unlimited,
      percent: usage.usage.statusPages.percentUsed,
    },
    {
      name: "Team Members",
      icon: Users,
      used: usage.usage.teamMembers.used,
      limit: usage.usage.teamMembers.limit,
      unlimited: usage.usage.teamMembers.unlimited,
      percent: usage.usage.teamMembers.percentUsed,
    },
  ];

  const featureItems = [
    { name: "Audit Logs", icon: FileText, enabled: usage.features.auditLogs },
    { name: "SSO", icon: Lock, enabled: usage.features.sso },
    { name: "Custom Roles", icon: Shield, enabled: usage.features.customRoles },
    { name: "SLO Targets", icon: BarChart3, enabled: usage.features.slo },
    { name: "Reports", icon: FileText, enabled: usage.features.reports },
    { name: "Multi-Region", icon: Map, enabled: usage.features.multiRegion },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Usage</CardTitle>
        <CardDescription>
          Current usage against your plan limits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resource Usage */}
        <div className="space-y-4">
          {resourceItems.map((item) => {
            const Icon = item.icon;
            const isNearLimit = item.percent >= 80 && !item.unlimited;
            const isAtLimit = item.percent >= 100 && !item.unlimited;

            return (
              <div key={item.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <span
                    className={
                      isAtLimit
                        ? "text-destructive font-medium"
                        : isNearLimit
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-muted-foreground"
                    }
                  >
                    {item.used} / {item.unlimited ? "Unlimited" : item.limit}
                  </span>
                </div>
                {!item.unlimited && (
                  <Progress
                    value={Math.min(item.percent, 100)}
                    className={
                      isAtLimit
                        ? "[&>div]:bg-destructive"
                        : isNearLimit
                          ? "[&>div]:bg-yellow-500"
                          : ""
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Features */}
        <div>
          <h4 className="text-sm font-medium mb-4">Plan Features</h4>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {featureItems.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.name}
                  className={`flex items-center gap-2 p-2 rounded ${
                    feature.enabled ? "" : "opacity-50"
                  }`}
                >
                  {feature.enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm">{feature.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoicesCard({
  invoices,
  isLoading,
}: {
  invoices?: Invoice[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>Your past invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice History</CardTitle>
        <CardDescription>Your past invoices and payments</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices && invoices.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.number || invoice.id.substring(0, 8)}
                  </TableCell>
                  <TableCell>{formatBillingDate(invoice.createdAt)}</TableCell>
                  <TableCell>
                    {formatCurrency(invoice.total, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "paid"
                          ? "default"
                          : invoice.status === "open"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {invoice.hostedInvoiceUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {invoice.invoicePdf && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={invoice.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No invoices yet</p>
            <p className="text-sm">
              Invoices will appear here once you subscribe to a paid plan
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlansGrid({
  plans,
  currentPlan,
  isLoading,
}: {
  plans?: Plan[];
  currentPlan: string;
  isLoading: boolean;
}) {
  if (isLoading || !plans) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isCurrent={currentPlan === plan.id}
          isUpgrade={
            PLAN_ORDER.indexOf(plan.id) > PLAN_ORDER.indexOf(currentPlan)
          }
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  isUpgrade,
}: {
  plan: Plan;
  isCurrent: boolean;
  isUpgrade: boolean;
}) {
  const { data: checkoutData, isLoading: checkoutLoading } = useCheckoutUrl(
    isUpgrade ? plan.id : ""
  );

  return (
    <Card className={plan.recommended ? "border-primary shadow-lg" : ""}>
      {plan.recommended && (
        <div className="bg-primary text-primary-foreground text-center text-sm py-1 rounded-t-lg">
          Recommended
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {plan.name}
          {isCurrent && (
            <Badge variant="secondary">Current</Badge>
          )}
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-1">
          {plan.price !== null ? (
            <>
              <span className="text-3xl font-bold">
                {formatCurrency(plan.price, plan.currency)}
              </span>
              <span className="text-muted-foreground">/{plan.interval}</span>
            </>
          ) : (
            <span className="text-3xl font-bold">Custom</span>
          )}
        </div>

        <ul className="space-y-2 text-sm">
          {plan.highlights.map((highlight, index) => (
            <li key={index} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>

        {isCurrent ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : plan.price === null ? (
          <Button variant="outline" className="w-full" asChild>
            <a href="mailto:sales@unified.sh">Contact Sales</a>
          </Button>
        ) : isUpgrade ? (
          <Button
            className="w-full"
            disabled={checkoutLoading || !checkoutData?.url}
            asChild={!!checkoutData?.url}
          >
            {checkoutData?.url ? (
              <a href={checkoutData.url} target="_blank" rel="noopener noreferrer">
                {checkoutLoading ? "Loading..." : "Upgrade"}
              </a>
            ) : (
              checkoutLoading ? "Loading..." : "Upgrade"
            )}
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            Downgrade via Portal
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
