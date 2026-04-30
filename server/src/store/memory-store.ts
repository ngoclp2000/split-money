import { randomUUID } from "node:crypto";
import { computeSplit } from "../domain/split-engine.js";
import type { Expense, ExpenseParticipant, Group, Member, Payment, PlannedExpense } from "../domain/types.js";
import type { AppStore, CreateExpensePayload, CreatePlannedExpensePayload } from "./store.js";

export class MemoryStore implements AppStore {
  private groups = new Map<string, Group>();
  private members = new Map<string, Member[]>();
  private expenses = new Map<string, Expense[]>();
  private payments = new Map<string, Payment[]>();
  private plannedExpenses = new Map<string, PlannedExpense[]>();

  async createGroup(name: string, currency: string, dates?: { startDate?: string; endDate?: string }, userId?: string): Promise<Group> {
    const now = new Date().toISOString();
    const group: Group = {
      id: randomUUID(),
      name,
      currency,
      startDate: dates?.startDate,
      endDate: dates?.endDate,
      shareToken: randomUUID().replaceAll("-", ""),
      publicEnabled: false,
      ownerId: userId,
      createdAt: now,
      updatedAt: now
    };
    this.groups.set(group.id, group);
    this.members.set(group.id, []);
    this.expenses.set(group.id, []);
    this.payments.set(group.id, []);
    this.plannedExpenses.set(group.id, []);
    return group;
  }

  async listGroups(userId?: string): Promise<Group[]> {
    const all = Array.from(this.groups.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return userId ? all.filter(g => !g.ownerId || g.ownerId === userId) : all;
  }

  async getGroup(groupId: string): Promise<Group | undefined> {
    return this.groups.get(groupId);
  }

  async getPublicGroup(shareToken: string): Promise<Group | undefined> {
    return Array.from(this.groups.values()).find((group) => group.shareToken === shareToken && group.publicEnabled);
  }

  async updateGroupSharing(groupId: string, publicEnabled: boolean): Promise<Group> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error("Group not found.");
    const updated = {
      ...group,
      shareToken: group.shareToken ?? randomUUID().replaceAll("-", ""),
      publicEnabled
    };
    this.groups.set(groupId, updated);
    return updated;
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.groups.delete(groupId);
    this.members.delete(groupId);
    this.expenses.delete(groupId);
    this.payments.delete(groupId);
    this.plannedExpenses.delete(groupId);
  }

  async addMember(groupId: string, displayName: string): Promise<Member> {
    if (!this.groups.has(groupId)) throw new Error("Group not found.");

    const member: Member = {
      id: randomUUID(),
      groupId,
      displayName,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.members.set(groupId, [...(this.members.get(groupId) ?? []), member]);
    return member;
  }

  async listMembers(groupId: string): Promise<Member[]> {
    return this.members.get(groupId) ?? [];
  }

  async updateMember(groupId: string, memberId: string, payload: Partial<Omit<Member, "id" | "groupId" | "joinedAt" | "updatedAt">>): Promise<Member> {
    const list = this.members.get(groupId) ?? [];
    const index = list.findIndex(m => m.id === memberId);
    if (index === -1) throw new Error("Member not found.");

    const updated = {
      ...list[index],
      ...payload,
      updatedAt: new Date().toISOString()
    };
    list[index] = updated;
    this.members.set(groupId, list);
    return updated;
  }

  async deleteMember(groupId: string, memberId: string): Promise<void> {
    const isUsedByExpense = (this.expenses.get(groupId) ?? []).some(
      (expense) =>
        expense.paidByMemberId === memberId ||
        expense.participants.some((participant) => participant.memberId === memberId)
    );
    const isUsedByPayment = (this.payments.get(groupId) ?? []).some(
      (payment) => payment.fromMemberId === memberId || payment.toMemberId === memberId
    );
    if (isUsedByExpense || isUsedByPayment) {
      throw new Error("Cannot delete a member used by expenses or payments.");
    }
    this.members.set(groupId, (this.members.get(groupId) ?? []).filter((member) => member.id !== memberId));
  }

  async createExpense(groupId: string, payload: CreateExpensePayload): Promise<Expense> {
    if (!this.groups.has(groupId)) throw new Error("Group not found.");

    const memberIds = new Set((this.members.get(groupId) ?? []).map((member) => member.id));
    if (!memberIds.has(payload.paidByMemberId)) throw new Error("Payer must be a group member.");
    for (const participant of payload.participants) {
      if (!memberIds.has(participant.memberId)) throw new Error("All participants must be group members.");
    }

    const expenseId = randomUUID();
    const computed = computeSplit(payload.amountMinor, payload.splitMethod, payload.participants);
    const participants: ExpenseParticipant[] = computed.map((participant) => ({
      id: randomUUID(),
      expenseId,
      memberId: participant.memberId,
      shareValue: participant.shareValue,
      computedAmountMinor: participant.computedAmountMinor
    }));

    const expense: Expense = {
      id: expenseId,
      groupId,
      title: payload.title,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      paidByMemberId: payload.paidByMemberId,
      splitMethod: payload.splitMethod,
      expenseDate: new Date().toISOString(),
      note: payload.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants
    };

    this.expenses.set(groupId, [expense, ...(this.expenses.get(groupId) ?? [])]);
    return expense;
  }

  async listExpenses(groupId: string): Promise<Expense[]> {
    return this.expenses.get(groupId) ?? [];
  }

  async deleteExpense(groupId: string, expenseId: string): Promise<void> {
    this.expenses.set(groupId, (this.expenses.get(groupId) ?? []).filter((expense) => expense.id !== expenseId));
  }

  async createPayment(groupId: string, payload: Omit<Payment, "id" | "groupId" | "createdAt" | "updatedAt">): Promise<Payment> {
    if (!this.groups.has(groupId)) throw new Error("Group not found.");

    const payment: Payment = {
      id: randomUUID(),
      groupId,
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.payments.set(groupId, [payment, ...(this.payments.get(groupId) ?? [])]);
    return payment;
  }

  async listPayments(groupId: string): Promise<Payment[]> {
    return this.payments.get(groupId) ?? [];
  }

  async deletePayment(groupId: string, paymentId: string): Promise<void> {
    this.payments.set(groupId, (this.payments.get(groupId) ?? []).filter((payment) => payment.id !== paymentId));
  }

  async createPlannedExpense(groupId: string, payload: CreatePlannedExpensePayload): Promise<PlannedExpense> {
    if (!this.groups.has(groupId)) throw new Error("Group not found.");
    const now = new Date().toISOString();
    const planned: PlannedExpense = {
      id: randomUUID(),
      groupId,
      title: payload.title,
      quantity: payload.quantity,
      unit: payload.unit,
      estimatedAmountMinor: payload.estimatedAmountMinor,
      currency: payload.currency,
      note: payload.note,
      createdAt: now,
      updatedAt: now
    };
    this.plannedExpenses.set(groupId, [planned, ...(this.plannedExpenses.get(groupId) ?? [])]);
    return planned;
  }

  async updatePlannedExpense(groupId: string, plannedExpenseId: string, payload: CreatePlannedExpensePayload): Promise<PlannedExpense> {
    const list = this.plannedExpenses.get(groupId) ?? [];
    const index = list.findIndex(p => p.id === plannedExpenseId);
    if (index === -1) throw new Error("Planned expense not found.");
    
    const updated = {
      ...list[index],
      title: payload.title,
      quantity: payload.quantity,
      unit: payload.unit,
      estimatedAmountMinor: payload.estimatedAmountMinor,
      currency: payload.currency,
      note: payload.note,
      updatedAt: new Date().toISOString()
    };
    list[index] = updated;
    this.plannedExpenses.set(groupId, list);
    return updated;
  }

  async listPlannedExpenses(groupId: string): Promise<PlannedExpense[]> {
    return this.plannedExpenses.get(groupId) ?? [];
  }

  async deletePlannedExpense(groupId: string, plannedExpenseId: string): Promise<void> {
    this.plannedExpenses.set(
      groupId,
      (this.plannedExpenses.get(groupId) ?? []).filter((p) => p.id !== plannedExpenseId)
    );
  }
}
