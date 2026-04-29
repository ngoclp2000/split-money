import type { ExpenseParticipantInput, SplitMethod } from "./types.js";

export type ComputedShare = {
  memberId: string;
  shareValue?: number;
  computedAmountMinor: number;
};

function assertParticipants(participants: ExpenseParticipantInput[]): void {
  if (participants.length === 0) {
    throw new Error("Expense must have at least one participant.");
  }

  const ids = new Set(participants.map((participant) => participant.memberId));
  if (ids.size !== participants.length) {
    throw new Error("Expense participants must be unique.");
  }
}

function distributeByWeights(
  totalMinor: number,
  participants: ExpenseParticipantInput[],
  weights: number[]
): ComputedShare[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Split weights must be greater than zero.");
  }

  const rawShares = weights.map((weight) => (totalMinor * weight) / totalWeight);
  const floored = rawShares.map(Math.floor);
  let remainder = totalMinor - floored.reduce((sum, amount) => sum + amount, 0);

  const order = rawShares
    .map((raw, index) => ({ index, fraction: raw - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; index < remainder; index += 1) {
    floored[order[index].index] += 1;
  }

  return participants.map((participant, index) => ({
    memberId: participant.memberId,
    shareValue: participant.value,
    computedAmountMinor: floored[index]
  }));
}

export function computeSplit(
  totalMinor: number,
  method: SplitMethod,
  participants: ExpenseParticipantInput[]
): ComputedShare[] {
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Expense amount must be a positive integer in minor units.");
  }

  assertParticipants(participants);

  if (method === "equal") {
    return distributeByWeights(
      totalMinor,
      participants,
      participants.map(() => 1)
    );
  }

  if (method === "shares") {
    return distributeByWeights(
      totalMinor,
      participants,
      participants.map((participant) => {
        if (participant.value == null || participant.value <= 0) {
          throw new Error("Share split requires positive share values.");
        }
        return participant.value;
      })
    );
  }

  if (method === "percentage") {
    const values = participants.map((participant) => participant.value ?? 0);
    const totalPercentage = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(totalPercentage - 100) > 0.000001) {
      throw new Error("Percentage split must add up to 100.");
    }

    return distributeByWeights(totalMinor, participants, values);
  }

  if (method === "exact") {
    const computed = participants.map((participant) => {
      if (participant.value == null || !Number.isInteger(participant.value) || participant.value < 0) {
        throw new Error("Exact split values must be non-negative integers in minor units.");
      }

      return {
        memberId: participant.memberId,
        shareValue: participant.value,
        computedAmountMinor: participant.value
      };
    });

    const sum = computed.reduce((total, participant) => total + participant.computedAmountMinor, 0);
    if (sum !== totalMinor) {
      throw new Error("Exact split amounts must equal the expense total.");
    }

    return computed;
  }

  throw new Error(`Unsupported split method: ${method}`);
}
