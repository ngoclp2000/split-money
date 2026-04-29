import type { Expense, ExpenseParticipantInput, Group, Member, Payment, SplitMethod } from "../domain/types.js";

export type CreateExpensePayload = {
  title: string;
  amountMinor: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantInput[];
  note?: string;
};

export interface AppStore {
  createGroup(name: string, currency: string, dates?: { startDate?: string; endDate?: string }): Promise<Group>;
  listGroups(): Promise<Group[]>;
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
}
