export type SplitMethod = "equal" | "exact" | "percentage" | "shares";

export type Group = {
  id: string;
  name: string;
  currency: string;
  startDate?: string;
  endDate?: string;
  shareToken?: string;
  publicEnabled: boolean;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  groupId: string;
  displayName: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  joinedAt: string;
  updatedAt: string;
};

export type ExpenseParticipantInput = {
  memberId: string;
  value?: number;
};

export type ExpenseParticipant = {
  id: string;
  expenseId: string;
  memberId: string;
  shareValue?: number;
  computedAmountMinor: number;
};

export type Expense = {
  id: string;
  groupId: string;
  title: string;
  amountMinor: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  expenseDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  participants: ExpenseParticipant[];
};

export type Payment = {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type Balance = {
  memberId: string;
  amountMinor: number;
};

export type SettlementSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
};

export type PlannedExpense = {
  id: string;
  groupId: string;
  title: string;
  quantity: number;
  unit?: string;
  estimatedAmountMinor?: number;
  currency: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
