import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { appRouter } from "../../routers";
import type { AuthenticatedUser } from "../../_core/sdk";
import { audit } from "../../firestore";
import { toolResult, toolError } from "../format";
import { isProdEnvironment, buildConfirmation, verifyConfirmation } from "../confirm";

type Caller = ReturnType<typeof appRouter.createCaller>;

/**
 * Wraps one allowlisted write procedure with the confirmation gate + mcp:
 * audit tagging, shared by every write tool below:
 *
 *  - dev: executes immediately, no gate.
 *  - prod, no confirmToken: mutates nothing — returns a preview + a 5-minute
 *    HMAC token bound to {tool, args-hash, user}. Call again with that token
 *    to actually execute.
 *  - prod, valid confirmToken: executes.
 *
 * On success, writes an EXTRA audit_logs row tagged `mcp:<tool>` alongside
 * whatever the wrapped procedure's own fsAudit call already recorded — so
 * agent-originated mutations stay separable from human ones without having
 * to touch the procedures themselves.
 */
function registerWriteTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  user: AuthenticatedUser,
  opts: {
    name: string;
    title: string;
    description: string;
    entity: string;
    inputSchema: Shape;
    buildPreview: (input: z.infer<z.ZodObject<Shape>>) => string;
    execute: (input: z.infer<z.ZodObject<Shape>>) => Promise<Record<string, unknown>>;
    entityId: (input: z.infer<z.ZodObject<Shape>>, result: Record<string, unknown>) => number | string | null;
  }
): void {
  // The generic Shape param defeats registerTool's own generic inference when routed
  // through a shared wrapper like this (works fine for literal inline calls elsewhere,
  // e.g. server/mcp/tools/generic.ts) — cast at the boundary; runtime behavior is
  // unaffected since the SDK just reads config.inputSchema off this object at call time.
  (server.registerTool as (name: string, config: unknown, cb: unknown) => void)(
    opts.name,
    {
      title: opts.title,
      description: `${opts.description} Prod writes require a confirmToken round-trip; dev writes execute immediately.`,
      inputSchema: { ...opts.inputSchema, confirmToken: z.string().optional() },
      // Additive create, not a delete/overwrite — destructiveHint:false is the accurate
      // annotation here, not every non-read tool defaults to "destructive".
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (rawInput: Record<string, unknown>) => {
      const { confirmToken, ...input } = rawInput as { confirmToken?: string } & Record<string, unknown>;
      const typedInput = input as z.infer<z.ZodObject<Shape>>;
      const subject = { tool: opts.name, args: input, userId: user.id };

      if (isProdEnvironment()) {
        if (!confirmToken) {
          const preview = opts.buildPreview(typedInput);
          const { confirmToken: issued, expiresInSeconds } = buildConfirmation(subject);
          return toolResult({
            status: "confirmation_required",
            preview,
            confirmToken: issued,
            expiresInSeconds,
            note: "Call this tool again with the same arguments plus this confirmToken to execute.",
          });
        }
        const verdict = verifyConfirmation(confirmToken, subject);
        if (!verdict.ok) return toolError("CONFIRMATION_INVALID", verdict.reason);
      }

      try {
        const result = await opts.execute(typedInput);
        await audit(
          user.id,
          user.name,
          `mcp:${opts.name}`,
          opts.entity,
          opts.entityId(typedInput, result),
          opts.buildPreview(typedInput)
        );
        return toolResult(result);
      } catch (error) {
        if (error instanceof TRPCError) return toolError(error.code, error.message);
        return toolError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
      }
    }
  );
}

export function registerWriteTools(server: McpServer, caller: Caller, user: AuthenticatedUser): void {
  registerWriteTool(server, user, {
    name: "quotations_create",
    title: "Create a quotation",
    description: "Creates a new customer quotation (sales/quotations domain).",
    entity: "quotation",
    inputSchema: {
      title: z.string().min(1),
      contactId: z.number().optional(),
      accountId: z.number().optional(),
      customerName: z.string().optional(),
      customerEmail: z.string().optional(),
      customerPhone: z.string().optional(),
      customerAddress: z.string().optional(),
      notes: z.string().optional(),
      opportunityId: z.number().optional(),
      discountPercent: z.string().optional(),
      discountManualAmount: z.string().optional(),
      vatEnabled: z.boolean().optional(),
      taxPercent: z.string().optional(),
      laborCost: z.string().optional(),
      installationFee: z.string().optional(),
      paymentTerms: z.string().optional(),
      warrantyTerms: z.string().optional(),
    },
    buildPreview: input => `Create quotation "${input.title}"${input.customerName ? ` for ${input.customerName}` : ""}`,
    execute: input => caller.quotations.create({ ...input, vatEnabled: input.vatEnabled ?? false }),
    entityId: (_input, result) => (typeof result.id === "number" ? result.id : null),
  });

  registerWriteTool(server, user, {
    name: "projects_add_payment",
    title: "Record a project payment",
    description: "Records a payment against a project's contract amount (projects domain).",
    entity: "project_payment",
    inputSchema: {
      projectId: z.number(),
      paymentDate: z.string(),
      amount: z.string(),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    },
    buildPreview: input => `Record payment of ${input.amount} on project #${input.projectId}, dated ${input.paymentDate}`,
    execute: input => caller.projects.addPayment(input),
    entityId: input => input.projectId,
  });

  registerWriteTool(server, user, {
    name: "purchase_orders_add_payment",
    title: "Record a purchase order payment",
    description: "Records a payment against a purchase order, rolling up its paidAmount/paymentStatus (purchasing domain).",
    entity: "purchase_order",
    inputSchema: {
      purchaseOrderId: z.number(),
      amount: z.string().min(1),
      paymentDate: z.string().min(1),
      paymentMethod: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    },
    buildPreview: input => `Record payment of ${input.amount} on PO #${input.purchaseOrderId}, dated ${input.paymentDate}`,
    execute: input => caller.purchaseOrders.addPayment(input),
    entityId: input => input.purchaseOrderId,
  });
}
