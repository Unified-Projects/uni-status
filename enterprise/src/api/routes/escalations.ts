import { OpenAPIHono } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { enterpriseDb as db } from "../../database";
import { escalationPolicies, escalationSteps } from "../../database/schema/escalation";
import { createEscalationPolicySchema } from "@uni-status/shared/validators";
import { requireOrganization, requireScope } from "../middleware/auth";
import { eq, and, asc } from "drizzle-orm";

export const escalationsRoutes = new OpenAPIHono();

type SeverityOverrideInput = {
  minor?: { ackTimeoutMinutes?: number };
  major?: { ackTimeoutMinutes?: number };
  critical?: { ackTimeoutMinutes?: number };
} | null | undefined;

type SeverityOverrideValue = number | { ackTimeoutMinutes?: number } | null | undefined;
type SeverityOverridesStored = {
  minor?: SeverityOverrideValue;
  major?: SeverityOverrideValue;
  critical?: SeverityOverrideValue;
} | null | undefined;

const extractAckTimeoutMinutes = (value: SeverityOverrideValue) => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "ackTimeoutMinutes" in value) {
    const minutes = (value as { ackTimeoutMinutes?: number }).ackTimeoutMinutes;
    return typeof minutes === "number" ? minutes : undefined;
  }
  return undefined;
};

const toSeverityOverrideMinutes = (overrides: SeverityOverrideInput | SeverityOverridesStored) => {
  if (!overrides) return undefined;
  return {
    minor: extractAckTimeoutMinutes(overrides.minor),
    major: extractAckTimeoutMinutes(overrides.major),
    critical: extractAckTimeoutMinutes(overrides.critical),
  };
};

const fromSeverityOverrideMinutes = (overrides: SeverityOverridesStored) => {
  const result: NonNullable<SeverityOverrideInput> = {};
  const minor = extractAckTimeoutMinutes(overrides?.minor);
  const major = extractAckTimeoutMinutes(overrides?.major);
  const critical = extractAckTimeoutMinutes(overrides?.critical);

  if (minor !== undefined) {
    result.minor = { ackTimeoutMinutes: minor };
  }
  if (major !== undefined) {
    result.major = { ackTimeoutMinutes: major };
  }
  if (critical !== undefined) {
    result.critical = { ackTimeoutMinutes: critical };
  }

  return result;
};

const withSeverityOverrides = <T extends { severityOverrides?: SeverityOverridesStored }>(policy: T) => ({
  ...policy,
  severityOverrides: fromSeverityOverrideMinutes(policy.severityOverrides),
});

// List escalation policies
escalationsRoutes.get("/", async (c) => {
  const organizationId = await requireOrganization(c);

  const policies = await db.query.escalationPolicies.findMany({
    where: eq(escalationPolicies.organizationId, organizationId),
    with: {
      steps: {
        orderBy: [asc(escalationSteps.stepNumber)],
      },
    },
  });

  return c.json({ success: true, data: policies.map(withSeverityOverrides) });
});

// Create escalation policy + steps
escalationsRoutes.post("/", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");

  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  const result = createEscalationPolicySchema.safeParse(body);
  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error?.issues?.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        })) || [],
      },
    }, 400);
  }

  const validated = result.data;

  const policyId = nanoid();
  const now = new Date();
  const severityOverrides = toSeverityOverrideMinutes(validated.severityOverrides);

  const [policy] = await db
    .insert(escalationPolicies)
    .values({
      id: policyId,
      organizationId,
      name: validated.name,
      description: validated.description,
      ackTimeoutMinutes: validated.ackTimeoutMinutes,
      severityOverrides: severityOverrides || {},
      active: validated.active ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const stepValues = validated.steps.map((s) => ({
    id: nanoid(),
    policyId,
    stepNumber: s.stepNumber,
    delayMinutes: s.delayMinutes ?? 0,
    channels: s.channels,
    oncallRotationId: s.oncallRotationId,
    notifyOnAckTimeout: s.notifyOnAckTimeout ?? true,
    skipIfAcknowledged: s.skipIfAcknowledged ?? true,
    createdAt: now,
  }));

  if (stepValues.length > 0) {
    await db.insert(escalationSteps).values(stepValues);
  }

  const created = await db.query.escalationPolicies.findFirst({
    where: eq(escalationPolicies.id, policyId),
    with: { steps: { orderBy: [asc(escalationSteps.stepNumber)] } },
  });

  if (!created) {
    return c.json({ success: false, error: "Policy creation failed" }, 500);
  }

  return c.json({ success: true, data: withSeverityOverrides(created) }, 201);
});

// Get single policy
escalationsRoutes.get("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  const { id } = c.req.param();

  const policy = await db.query.escalationPolicies.findFirst({
    where: and(
      eq(escalationPolicies.id, id),
      eq(escalationPolicies.organizationId, organizationId)
    ),
    with: {
      steps: {
        orderBy: [asc(escalationSteps.stepNumber)],
      },
    },
  });

  if (!policy) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({ success: true, data: withSeverityOverrides(policy) });
});

// Update policy (replace steps)
escalationsRoutes.patch("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const body = await c.req.json();
  const validated = createEscalationPolicySchema.partial().parse(body);

  const existing = await db.query.escalationPolicies.findFirst({
    where: and(
      eq(escalationPolicies.id, id),
      eq(escalationPolicies.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  const now = new Date();
  const severityOverrides = toSeverityOverrideMinutes(validated.severityOverrides);

  const [updated] = await db
    .update(escalationPolicies)
    .set({
      name: validated.name ?? existing.name,
      description: validated.description ?? existing.description,
      ackTimeoutMinutes: validated.ackTimeoutMinutes ?? existing.ackTimeoutMinutes,
      severityOverrides: severityOverrides ?? existing.severityOverrides,
      active: validated.active ?? existing.active,
      updatedAt: now,
    })
    .where(
      and(eq(escalationPolicies.id, id), eq(escalationPolicies.organizationId, organizationId))
    )
    .returning();

  if (validated.steps) {
    await db.delete(escalationSteps).where(eq(escalationSteps.policyId, id));

    const newSteps = validated.steps.map((s) => ({
      id: nanoid(),
      policyId: id,
      stepNumber: s.stepNumber,
      delayMinutes: s.delayMinutes ?? 0,
      channels: s.channels,
      oncallRotationId: s.oncallRotationId,
      notifyOnAckTimeout: s.notifyOnAckTimeout ?? true,
      skipIfAcknowledged: s.skipIfAcknowledged ?? true,
      createdAt: now,
    }));

    if (newSteps.length > 0) {
      await db.insert(escalationSteps).values(newSteps);
    }
  }

  const hydrated = await db.query.escalationPolicies.findFirst({
    where: eq(escalationPolicies.id, id),
    with: { steps: { orderBy: [asc(escalationSteps.stepNumber)] } },
  });

  const responsePolicy = hydrated ?? updated;
  if (!responsePolicy) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({ success: true, data: withSeverityOverrides(responsePolicy) });
});

// Delete policy
escalationsRoutes.delete("/:id", async (c) => {
  const organizationId = await requireOrganization(c);
  requireScope(c, "write");
  const { id } = c.req.param();

  const existing = await db.query.escalationPolicies.findFirst({
    where: and(
      eq(escalationPolicies.id, id),
      eq(escalationPolicies.organizationId, organizationId)
    ),
  });

  if (!existing) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  await db.delete(escalationSteps).where(eq(escalationSteps.policyId, id));
  await db
    .delete(escalationPolicies)
    .where(
      and(eq(escalationPolicies.id, id), eq(escalationPolicies.organizationId, organizationId))
    );

  return c.json({ success: true, data: { deleted: true } });
});
