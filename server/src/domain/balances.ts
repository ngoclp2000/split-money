import type { Balance, Expense, Payment, SettlementSuggestion } from "./types.js";

export function computeBalances(memberIds: string[], expenses: Expense[], payments: Payment[]): Balance[] {
  const balances = new Map(memberIds.map((memberId) => [memberId, 0]));

  for (const expense of expenses) {
    balances.set(expense.paidByMemberId, (balances.get(expense.paidByMemberId) ?? 0) + expense.amountMinor);

    for (const participant of expense.participants) {
      balances.set(participant.memberId, (balances.get(participant.memberId) ?? 0) - participant.computedAmountMinor);
    }
  }

  for (const payment of payments) {
    balances.set(payment.fromMemberId, (balances.get(payment.fromMemberId) ?? 0) + payment.amountMinor);
    balances.set(payment.toMemberId, (balances.get(payment.toMemberId) ?? 0) - payment.amountMinor);
  }

  return Array.from(balances.entries())
    .map(([memberId, amountMinor]) => ({ memberId, amountMinor }))
    .filter((balance) => balance.amountMinor !== 0);
}

export function simplifyDebts(balances: Balance[]): SettlementSuggestion[] {
  const debtors = balances
    .filter((balance) => balance.amountMinor < 0)
    .map((balance) => ({ memberId: balance.memberId, amountMinor: -balance.amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const creditors = balances
    .filter((balance) => balance.amountMinor > 0)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const suggestions: SettlementSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amountMinor = Math.min(debtors[debtorIndex].amountMinor, creditors[creditorIndex].amountMinor);

    if (amountMinor > 0) {
      suggestions.push({
        fromMemberId: debtors[debtorIndex].memberId,
        toMemberId: creditors[creditorIndex].memberId,
        amountMinor
      });
    }

    debtors[debtorIndex].amountMinor -= amountMinor;
    creditors[creditorIndex].amountMinor -= amountMinor;

    if (debtors[debtorIndex].amountMinor === 0) debtorIndex += 1;
    if (creditors[creditorIndex].amountMinor === 0) creditorIndex += 1;
  }

  return suggestions;
}
