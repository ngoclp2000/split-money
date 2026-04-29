import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { computeBalances, simplifyDebts } from "../domain/balances.js";
import type { AppStore } from "../store/store.js";
import { createExpenseSchema, createGroupSchema, createMemberSchema, createPaymentSchema, updateSharingSchema } from "./schemas.js";

export function createApp(store: AppStore) {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? true }));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/groups", async (_request, response, next) => {
    try {
      response.json(await store.listGroups());
    } catch (error) {
      next(error);
    }
  });

  app.post("/groups", async (request, response, next) => {
    try {
      const input = createGroupSchema.parse(request.body);
      response.status(201).json(await store.createGroup(input.name, input.currency.toUpperCase(), {
        startDate: input.startDate,
        endDate: input.endDate
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/public/groups/:shareToken", async (request, response, next) => {
    try {
      const group = await store.getPublicGroup(request.params.shareToken);
      if (!group) return response.status(404).json({ message: "Public group not found." });
      response.json(await getGroupSnapshot(store, group.id, group));
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId", async (request, response, next) => {
    try {
      const group = await store.getGroup(request.params.groupId);
      if (!group) return response.status(404).json({ message: "Group not found." });
      response.json(group);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/groups/:groupId", async (request, response, next) => {
    try {
      await store.deleteGroup(request.params.groupId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.patch("/groups/:groupId/sharing", async (request, response, next) => {
    try {
      const input = updateSharingSchema.parse(request.body);
      response.json(await store.updateGroupSharing(request.params.groupId, input.publicEnabled));
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId/members", async (request, response, next) => {
    try {
      response.json(await store.listMembers(request.params.groupId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/groups/:groupId/members", async (request, response, next) => {
    try {
      const input = createMemberSchema.parse(request.body);
      response.status(201).json(await store.addMember(request.params.groupId, input.displayName));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/groups/:groupId/members/:memberId", async (request, response, next) => {
    try {
      await store.deleteMember(request.params.groupId, request.params.memberId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId/expenses", async (request, response, next) => {
    try {
      response.json(await store.listExpenses(request.params.groupId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/groups/:groupId/expenses", async (request, response, next) => {
    try {
      const input = createExpenseSchema.parse(request.body);
      response.status(201).json(await store.createExpense(request.params.groupId, input));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/groups/:groupId/expenses/:expenseId", async (request, response, next) => {
    try {
      await store.deleteExpense(request.params.groupId, request.params.expenseId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId/payments", async (request, response, next) => {
    try {
      response.json(await store.listPayments(request.params.groupId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/groups/:groupId/payments", async (request, response, next) => {
    try {
      const input = createPaymentSchema.parse(request.body);
      response.status(201).json(await store.createPayment(request.params.groupId, input));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/groups/:groupId/payments/:paymentId", async (request, response, next) => {
    try {
      await store.deletePayment(request.params.groupId, request.params.paymentId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId/balances", async (request, response, next) => {
    try {
      response.json(await getBalances(store, request.params.groupId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/groups/:groupId/settlement-suggestions", async (request, response, next) => {
    try {
      const balances = await getBalances(store, request.params.groupId);
      response.json(simplifyDebts(balances));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unexpected error.";
    const status = message.includes("not found") ? 404 : 400;
    response.status(status).json({ message });
  });

  return app;
}

async function getBalances(store: AppStore, groupId: string) {
  const members = await store.listMembers(groupId);
  const expenses = await store.listExpenses(groupId);
  const payments = await store.listPayments(groupId);
  return computeBalances(
    members.map((member) => member.id),
    expenses,
    payments
  );
}

async function getGroupSnapshot(store: AppStore, groupId: string, group?: Awaited<ReturnType<AppStore["getGroup"]>>) {
  const resolvedGroup = group ?? await store.getGroup(groupId);
  if (!resolvedGroup) throw new Error("Group not found.");

  const members = await store.listMembers(groupId);
  const expenses = await store.listExpenses(groupId);
  const payments = await store.listPayments(groupId);
  const balances = computeBalances(
    members.map((member) => member.id),
    expenses,
    payments
  );

  return {
    group: resolvedGroup,
    members,
    expenses,
    payments,
    balances,
    settlements: simplifyDebts(balances)
  };
}
