import type { Expense, ExpenseParticipantInput, Group, Member, Payment, PlannedExpense, SplitMethod } from "../domain/types.js";

export type CreateExpensePayload = {
  title: string;
  amountMinor: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantInput[];
  note?: string;
};

export type CreatePlannedExpensePayload = {
  title: string;
  quantity: number;
  unit?: string;
  estimatedAmountMinor?: number;
  currency: string;
  note?: string;
};

export interface AppStore {
  createGroup(name: string, currency: string, dates?: { startDate?: string; endDate?: string }, userId?: string): Promise<Group>;
  listGroups(userId?: string): Promise<Group[]>;
  getGroup(groupId: string): Promise<Group | undefined>;
  getPublicGroup(shareToken: string): Promise<Group | undefined>;
  updateGroupSharing(groupId: string, publicEnabled: boolean): Promise<Group>;
  deleteGroup(groupId: string): Promise<void>;
  addMember(groupId: string, displayName: string): Promise<Member>;
  deleteMember(groupId: string, memberId: string): Promise<void>;
  listMembers(groupId: string): Promise<Member[]>;
  createExpense(groupId: string, payload: CreateExpensePayload): Promise<Expense>;
  deleteExpense(groupId: string, expenseId: string): Promise<void>;
  listExpenses(groupId: string): Promise<Expense[]>;
  createPayment(groupId: string, payload: Omit<Payment, "id" | "groupId" | "createdAt" | "updatedAt">): Promise<Payment>;
  deletePayment(groupId: string, paymentId: string): Promise<void>;
  listPayments(groupId: string): Promise<Payment[]>;
  createPlannedExpense(groupId: string, payload: CreatePlannedExpensePayload): Promise<PlannedExpense>;
  updatePlannedExpense(groupId: string, plannedExpenseId: string, payload: CreatePlannedExpensePayload): Promise<PlannedExpense>;
  deletePlannedExpense(groupId: string, plannedExpenseId: string): Promise<void>;
  listPlannedExpenses(groupId: string): Promise<PlannedExpense[]>;
}
