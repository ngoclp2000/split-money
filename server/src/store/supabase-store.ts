import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeSplit } from "../domain/split-engine.js";
import type { Expense, ExpenseParticipant, Group, Member, Payment } from "../domain/types.js";
import type { AppStore, CreateExpensePayload } from "./store.js";

function mapGroup(row: Record<string, any>): Group {
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    shareToken: row.share_token ?? undefined,
    publicEnabled: Boolean(row.public_enabled),
    createdAt,
    updatedAt: row.updated_at ?? createdAt
  };
}

function mapMember(row: Record<string, any>): Member {
  return {
    id: row.id,
    groupId: row.group_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at ?? row.joined_at
  };
}

function mapPayment(row: Record<string, any>): Payment {
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    groupId: row.group_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountMinor: Number(row.amount_minor),
    note: row.note ?? undefined,
    createdAt,
    updatedAt: row.updated_at ?? createdAt
  };
}

export class SupabaseStore implements AppStore {
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey);
  }

  async createGroup(name: string, currency: string, dates?: { startDate?: string; endDate?: string }): Promise<Group> {
    const row = {
      id: randomUUID(),
      name,
      currency,
      start_date: dates?.startDate ?? null,
      end_date: dates?.endDate ?? null,
      share_token: randomUUID().replaceAll("-", ""),
      public_enabled: false
    };
    const { data, error } = await this.client.from("groups").insert(row).select("*").single();
    if (error && error.message.includes("Could not find")) {
      const fallbackRow = { id: row.id, name, currency };
      const { data: fallbackData, error: fallbackError } = await this.client
        .from("groups")
        .insert(fallbackRow)
        .select("*")
        .single();
      if (fallbackError) throw fallbackError;
      return mapGroup(fallbackData);
    }
    if (error) throw error;
    return mapGroup(data);
  }

  async listGroups(): Promise<Group[]> {
    const { data, error } = await this.client.from("groups").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(mapGroup);
  }

  async getGroup(groupId: string): Promise<Group | undefined> {
    const { data, error } = await this.client.from("groups").select("*").eq("id", groupId).maybeSingle();
    if (error) throw error;
    return data ? mapGroup(data) : undefined;
  }

  async getPublicGroup(shareToken: string): Promise<Group | undefined> {
    const { data, error } = await this.client
      .from("groups")
      .select("*")
      .eq("share_token", shareToken)
      .eq("public_enabled", true)
      .maybeSingle();
    if (error) throw error;
    return data ? mapGroup(data) : undefined;
  }

  async updateGroupSharing(groupId: string, publicEnabled: boolean): Promise<Group> {
    const existing = await this.getGroup(groupId);
    if (!existing) throw new Error("Group not found.");

    const { data, error } = await this.client
      .from("groups")
      .update({
        public_enabled: publicEnabled,
        share_token: existing.shareToken ?? randomUUID().replaceAll("-", "")
      })
      .eq("id", groupId)
      .select("*")
      .single();
    if (error) throw error;
    return mapGroup(data);
  }

  async deleteGroup(groupId: string): Promise<void> {
    const { error } = await this.client.from("groups").delete().eq("id", groupId);
    if (error) throw error;
  }

  async addMember(groupId: string, displayName: string): Promise<Member> {
    const row = { id: randomUUID(), group_id: groupId, display_name: displayName };
    const { data, error } = await this.client.from("group_members").insert(row).select("*").single();
    if (error) throw error;
    return mapMember(data);
  }

  async listMembers(groupId: string): Promise<Member[]> {
    const { data, error } = await this.client
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return data.map(mapMember);
  }

  async deleteMember(groupId: string, memberId: string): Promise<void> {
    const { count: expenseCount, error: expenseError } = await this.client
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("paid_by_member_id", memberId);
    if (expenseError) throw expenseError;

    const { count: participantCount, error: participantError } = await this.client
      .from("expense_participants")
      .select("id, expenses!inner(group_id)", { count: "exact", head: true })
      .eq("member_id", memberId)
      .eq("expenses.group_id", groupId);
    if (participantError) throw participantError;

    const { count: paymentFromCount, error: paymentFromError } = await this.client
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("from_member_id", memberId);
    if (paymentFromError) throw paymentFromError;

    const { count: paymentToCount, error: paymentToError } = await this.client
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("to_member_id", memberId);
    if (paymentToError) throw paymentToError;

    if ((expenseCount ?? 0) + (participantCount ?? 0) + (paymentFromCount ?? 0) + (paymentToCount ?? 0) > 0) {
      throw new Error("Cannot delete a member used by expenses or payments.");
    }

    const { error } = await this.client.from("group_members").delete().eq("group_id", groupId).eq("id", memberId);
    if (error) throw error;
  }

  async createExpense(groupId: string, payload: CreateExpensePayload): Promise<Expense> {
    const expenseId = randomUUID();
    const computed = computeSplit(payload.amountMinor, payload.splitMethod, payload.participants);
    const expenseRow = {
      id: expenseId,
      group_id: groupId,
      title: payload.title,
      amount_minor: payload.amountMinor,
      currency: payload.currency,
      paid_by_member_id: payload.paidByMemberId,
      split_method: payload.splitMethod,
      note: payload.note ?? null
    };

    const participantRows = computed.map((participant) => ({
      id: randomUUID(),
      expense_id: expenseId,
      member_id: participant.memberId,
      share_value: participant.shareValue ?? null,
      computed_amount_minor: participant.computedAmountMinor
    }));

    const { data: expenseData, error: expenseError } = await this.client
      .from("expenses")
      .insert(expenseRow)
      .select("*")
      .single();
    if (expenseError) throw expenseError;

    const { data: participantData, error: participantError } = await this.client
      .from("expense_participants")
      .insert(participantRows)
      .select("*");
    if (participantError) throw participantError;

    return this.mapExpense(expenseData, participantData);
  }

  async listExpenses(groupId: string): Promise<Expense[]> {
    const { data: expenses, error: expenseError } = await this.client
      .from("expenses")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (expenseError) throw expenseError;

    const ids = expenses.map((expense) => expense.id);
    if (ids.length === 0) return [];

    const { data: participants, error: participantError } = await this.client
      .from("expense_participants")
      .select("*")
      .in("expense_id", ids);
    if (participantError) throw participantError;

    return expenses.map((expense) =>
      this.mapExpense(
        expense,
        participants.filter((participant) => participant.expense_id === expense.id)
      )
    );
  }

  async deleteExpense(groupId: string, expenseId: string): Promise<void> {
    const { error } = await this.client.from("expenses").delete().eq("group_id", groupId).eq("id", expenseId);
    if (error) throw error;
  }

  async createPayment(groupId: string, payload: Omit<Payment, "id" | "groupId" | "createdAt" | "updatedAt">): Promise<Payment> {
    const row = {
      id: randomUUID(),
      group_id: groupId,
      from_member_id: payload.fromMemberId,
      to_member_id: payload.toMemberId,
      amount_minor: payload.amountMinor,
      note: payload.note ?? null
    };
    const { data, error } = await this.client.from("payments").insert(row).select("*").single();
    if (error) throw error;
    return mapPayment(data);
  }

  async listPayments(groupId: string): Promise<Payment[]> {
    const { data, error } = await this.client
      .from("payments")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(mapPayment);
  }

  async deletePayment(groupId: string, paymentId: string): Promise<void> {
    const { error } = await this.client.from("payments").delete().eq("group_id", groupId).eq("id", paymentId);
    if (error) throw error;
  }

  private mapExpense(expense: Record<string, any>, participants: Record<string, any>[]): Expense {
    return {
      id: expense.id,
      groupId: expense.group_id,
      title: expense.title,
      amountMinor: Number(expense.amount_minor),
      currency: expense.currency,
      paidByMemberId: expense.paid_by_member_id,
      splitMethod: expense.split_method,
      expenseDate: expense.expense_date,
      note: expense.note ?? undefined,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at ?? expense.created_at,
      participants: participants.map((participant): ExpenseParticipant => ({
        id: participant.id,
        expenseId: participant.expense_id,
        memberId: participant.member_id,
        shareValue: participant.share_value == null ? undefined : Number(participant.share_value),
        computedAmountMinor: Number(participant.computed_amount_minor)
      }))
    };
  }
}
