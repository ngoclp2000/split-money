import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  currency: z.string().trim().min(3).max(3).default("VND"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
});

export const createMemberSchema = z.object({
  displayName: z.string().trim().min(1)
});

export const updateMemberSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  bankCode: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  accountName: z.string().trim().optional()
});

export const createExpenseSchema = z.object({
  title: z.string().trim().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().min(3).max(3),
  paidByMemberId: z.string().uuid(),
  splitMethod: z.enum(["equal", "exact", "percentage", "shares"]),
  participants: z.array(
    z.object({
      memberId: z.string().uuid(),
      value: z.number().optional()
    })
  ).min(1),
  note: z.string().trim().optional()
});

export const createPaymentSchema = z.object({
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  note: z.string().trim().optional()
});

export const updateSharingSchema = z.object({
  publicEnabled: z.boolean()
});

export const createPlannedExpenseSchema = z.object({
  title: z.string().trim().min(1),
  quantity: z.number().positive().default(1),
  unit: z.string().trim().optional(),
  estimatedAmountMinor: z.number().int().positive().optional(),
  currency: z.string().trim().min(3).max(3),
  note: z.string().trim().optional()
});
