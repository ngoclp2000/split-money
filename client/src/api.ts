export type SplitMethod = "equal" | "exact" | "percentage" | "shares";

export type Group = {
  id: string;
  name: string;
  currency: string;
  startDate?: string;
  endDate?: string;
  shareToken?: string;
  publicEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  groupId: string;
  displayName: string;
  joinedAt: string;
  updatedAt: string;
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

export type Balance = {
  memberId: string;
  amountMinor: number;
};

export type SettlementSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
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

export type GroupSnapshot = {
  group: Group;
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  balances: Balance[];
  settlements: SettlementSuggestion[];
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed." }));
    throw new Error(body.message ?? "Request failed.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listGroups: () => request<Group[]>("/groups"),
  createGroup: (body: { name: string; currency: string; startDate?: string; endDate?: string }) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(body) }),
  deleteGroup: (groupId: string) => request<void>(`/groups/${groupId}`, { method: "DELETE" }),
  updateSharing: (groupId: string, body: { publicEnabled: boolean }) =>
    request<Group>(`/groups/${groupId}/sharing`, { method: "PATCH", body: JSON.stringify(body) }),
  getPublicGroup: (shareToken: string) => request<GroupSnapshot>(`/public/groups/${shareToken}`),
  listMembers: (groupId: string) => request<Member[]>(`/groups/${groupId}/members`),
  addMember: (groupId: string, body: { displayName: string }) =>
    request<Member>(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify(body) }),
  deleteMember: (groupId: string, memberId: string) =>
    request<void>(`/groups/${groupId}/members/${memberId}`, { method: "DELETE" }),
  listExpenses: (groupId: string) => request<Expense[]>(`/groups/${groupId}/expenses`),
  createExpense: (
    groupId: string,
    body: {
      title: string;
      amountMinor: number;
      currency: string;
      paidByMemberId: string;
      splitMethod: SplitMethod;
      participants: Array<{ memberId: string; value?: number }>;
      note?: string;
    }
  ) => request<Expense>(`/groups/${groupId}/expenses`, { method: "POST", body: JSON.stringify(body) }),
  deleteExpense: (groupId: string, expenseId: string) =>
    request<void>(`/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),
  listBalances: (groupId: string) => request<Balance[]>(`/groups/${groupId}/balances`),
  listSettlementSuggestions: (groupId: string) =>
    request<SettlementSuggestion[]>(`/groups/${groupId}/settlement-suggestions`),
  createPayment: (
    groupId: string,
    body: { fromMemberId: string; toMemberId: string; amountMinor: number; note?: string }
  ) => request<Payment>(`/groups/${groupId}/payments`, { method: "POST", body: JSON.stringify(body) }),
  deletePayment: (groupId: string, paymentId: string) =>
    request<void>(`/groups/${groupId}/payments/${paymentId}`, { method: "DELETE" })
};
