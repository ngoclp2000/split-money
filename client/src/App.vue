<script setup lang="ts">
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NConfigProvider,
  NDivider,
  NEmpty,
  NFormItem,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NModal,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  darkTheme
} from "naive-ui";
import { Banknote, Check, ClipboardList, Copy, CreditCard, ExternalLink, EyeOff, LogOut, Plus, ReceiptText, RefreshCw, Share2, Trash2, UsersRound } from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api, setTokenProvider, type Balance, type Expense, type Group, type GroupSnapshot, type Member, type PlannedExpense, type SettlementSuggestion, type SplitMethod } from "./api";
import { formatMoney, toMinorUnits } from "./money";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

// QR lightbox
const qrLightbox = ref<{ src: string; alt: string } | null>(null);

function openQrLightbox(src: string, alt: string) {
  qrLightbox.value = { src, alt };
}

function closeQrLightbox() {
  qrLightbox.value = null;
}

// Close on ESC
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQrLightbox();
  });
}

// Bank info editing modal
const bankInfoModal = reactive({
  open: false,
  memberId: "",
  memberName: "",
  bankCode: "",
  accountNumber: "",
  accountName: ""
});

// Moved to after reactive variables

const VIET_BANKS = [
  { label: "Vietcombank (VCB)", value: "VCB" },
  { label: "Techcombank (TCB)", value: "TCB" },
  { label: "MB Bank (MB)", value: "MB" },
  { label: "BIDV", value: "BIDV" },
  { label: "Vietinbank (CTG)", value: "CTG" },
  { label: "ACB", value: "ACB" },
  { label: "Sacombank (STB)", value: "STB" },
  { label: "VPBank (VPB)", value: "VPB" },
  { label: "TPBank (TPB)", value: "TPB" },
  { label: "Agribank (VBA)", value: "VBA" },
  { label: "SHB", value: "SHB" },
  { label: "HDBank (HDB)", value: "HDB" },
  { label: "OCB", value: "OCB" },
  { label: "MSB", value: "MSB" },
  { label: "SeABank (SEAB)", value: "SEAB" },
  { label: "VIB", value: "VIB" },
  { label: "Eximbank (EIB)", value: "EIB" },
  { label: "Nam A Bank (NAB)", value: "NAB" },
  { label: "BacABank (BAB)", value: "BAB" },
  { label: "Kiên Long (KLB)", value: "KLB" },
];

function vietQrUrl(bankCode: string, accountNumber: string, accountName: string, amountMinor: number, currency: string, description: string): string {
  const amount = currency === "VND" ? amountMinor : Math.round(amountMinor / 100);
  const desc = encodeURIComponent(description.slice(0, 50));
  const name = encodeURIComponent(accountName);
  return `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.jpg?amount=${amount}&addInfo=${desc}&accountName=${name}`;
}

const notice = ref<{ type: "success" | "error"; text: string } | null>(null);

// Auth state
const currentUser = ref<User | null>(null);
const authLoading = ref(true);
const loginForm = reactive({ email: "", password: "" });
const loginError = ref("");
const loginSubmitting = ref(false);

// Setup token provider for API requests
setTokenProvider(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

const groups = ref<Group[]>([]);
const selectedGroupId = ref<string | null>(null);
const members = ref<Member[]>([]);
const expenses = ref<Expense[]>([]);
const balances = ref<Balance[]>([]);
const settlements = ref<SettlementSuggestion[]>([]);
const plannedExpenses = ref<PlannedExpense[]>([]);
const loading = ref(false);
const publicSnapshot = ref<GroupSnapshot | null>(null);
const publicLoading = ref(false);
const isPublicMode = window.location.pathname.startsWith("/public/");

const groupForm = reactive({
  name: "Chuyến đi Đà Lạt",
  currency: "VND",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: ""
});
const memberName = ref("");
const expenseForm = reactive({
  title: "",
  amount: 0,
  paidByMemberId: "",
  splitMethod: "equal" as SplitMethod,
  note: ""
});
const selectedParticipantIds = ref<string[]>([]);
const participantValues = reactive<Record<string, number>>({});
const plannedExpenseForm = reactive({ title: "", quantity: 1, unit: "", estimatedAmount: null as number | null, note: "" });
const editingPlannedId = ref<string | null>(null);

function getBankInfo(memberId: string) {
  const member = isPublicMode ? publicSnapshot.value?.members.find(m => m.id === memberId) : members.value.find(m => m.id === memberId);
  if (!member || !member.accountNumber) return null;
  return {
    bankCode: member.bankCode || "",
    accountNumber: member.accountNumber || "",
    accountName: member.accountName || member.displayName
  };
}

function openBankInfoModal(member: Member) {
  bankInfoModal.open = true;
  bankInfoModal.memberId = member.id;
  bankInfoModal.memberName = member.displayName;
  bankInfoModal.bankCode = member.bankCode || "";
  bankInfoModal.accountNumber = member.accountNumber || "";
  bankInfoModal.accountName = member.accountName || member.displayName;
}

async function saveBankInfo() {
  if (!bankInfoModal.memberId || !selectedGroupId.value) return;
  try {
    const payload = bankInfoModal.accountNumber.trim() ? {
      bankCode: bankInfoModal.bankCode.trim().toUpperCase(),
      accountNumber: bankInfoModal.accountNumber.trim(),
      accountName: bankInfoModal.accountName.trim()
    } : {
      bankCode: "",
      accountNumber: "",
      accountName: ""
    };
    await api.updateMember(selectedGroupId.value, bankInfoModal.memberId, payload);
    await refreshGroupData();
    bankInfoModal.open = false;
    notice.value = { type: "success", text: "Đã cập nhật thông tin ngân hàng" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Lỗi cập nhật thông tin ngân hàng" };
  }
}

const selectedGroup = computed(() => groups.value.find((group) => group.id === selectedGroupId.value));
const publicLink = computed(() => {
  if (!selectedGroup.value?.shareToken) return "";
  return `${window.location.origin}/public/${selectedGroup.value.shareToken}`;
});
const memberOptions = computed(() => members.value.map((member) => ({ label: member.displayName, value: member.id })));
const currency = computed(() => selectedGroup.value?.currency ?? groupForm.currency);
const totalMinor = computed(() => toMinorUnits(Number(expenseForm.amount || 0), currency.value));
const allocatedMinor = computed(() => {
  if (expenseForm.splitMethod === "exact") {
    return selectedParticipantIds.value.reduce((sum, memberId) => sum + toMinorUnits(participantValues[memberId] || 0, currency.value), 0);
  }
  return totalMinor.value;
});
const allocationDelta = computed(() => totalMinor.value - allocatedMinor.value);
const percentageTotal = computed(() =>
  selectedParticipantIds.value.reduce((sum, memberId) => sum + (participantValues[memberId] || 0), 0)
);

function memberNameById(memberId: string): string {
  return members.value.find((member) => member.id === memberId)?.displayName ?? "Không rõ";
}

function snapshotMemberNameById(snapshot: GroupSnapshot, memberId: string): string {
  return snapshot.members.find((member) => member.id === memberId)?.displayName ?? "Không rõ";
}

function formatDate(value?: string): string {
  if (!value) return "Chưa đặt";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string): string {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function groupDateRange(group?: Group): string {
  if (!group) return "";
  if (group.startDate && group.endDate) return `${formatDate(group.startDate)} - ${formatDate(group.endDate)}`;
  if (group.startDate) return `Từ ${formatDate(group.startDate)}`;
  if (group.endDate) return `Đến ${formatDate(group.endDate)}`;
  return "Chưa đặt thời gian nhóm";
}

function participantAmountPreview(memberId: string): number {
  const count = selectedParticipantIds.value.length || 1;
  if (expenseForm.splitMethod === "equal") {
    return Math.floor(totalMinor.value / count);
  }
  if (expenseForm.splitMethod === "exact") {
    return toMinorUnits(participantValues[memberId] || 0, currency.value);
  }
  if (expenseForm.splitMethod === "percentage") {
    return Math.round((totalMinor.value * (participantValues[memberId] || 0)) / 100);
  }
  const totalShares = selectedParticipantIds.value.reduce((sum, id) => sum + (participantValues[id] || 0), 0) || 1;
  return Math.round((totalMinor.value * (participantValues[memberId] || 0)) / totalShares);
}

async function refreshGroupData() {
  if (!selectedGroupId.value) return;
  loading.value = true;
  try {
    const groupId = selectedGroupId.value;
    const [nextMembers, nextExpenses, nextBalances, nextSettlements, nextPlanned] = await Promise.all([
      api.listMembers(groupId),
      api.listExpenses(groupId),
      api.listBalances(groupId),
      api.listSettlementSuggestions(groupId),
      api.listPlannedExpenses(groupId)
    ]);
    members.value = nextMembers;
    expenses.value = nextExpenses;
    balances.value = nextBalances;
    settlements.value = nextSettlements;
    plannedExpenses.value = nextPlanned;
    if (!expenseForm.paidByMemberId && nextMembers[0]) expenseForm.paidByMemberId = nextMembers[0].id;
    selectedParticipantIds.value = nextMembers.map((member) => member.id);
    for (const member of nextMembers) {
      participantValues[member.id] ??= expenseForm.splitMethod === "percentage" ? Math.round(100 / nextMembers.length) : 1;
    }
  } finally {
    loading.value = false;
  }
}

async function refreshGroups() {
  groups.value = await api.listGroups();
  if (!selectedGroupId.value && groups.value[0]) {
    selectedGroupId.value = groups.value[0].id;
    await refreshGroupData();
  }
}

async function refreshPublicSnapshot() {
  const token = window.location.pathname.split("/public/")[1]?.split("/")[0];
  if (!token) return;
  publicLoading.value = true;
  try {
    publicSnapshot.value = await api.getPublicGroup(token);
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không mở được link public" };
  } finally {
    publicLoading.value = false;
  }
}

async function createGroup() {
  try {
    const group = await api.createGroup({
      name: groupForm.name,
      currency: groupForm.currency.toUpperCase(),
      startDate: groupForm.startDate || undefined,
      endDate: groupForm.endDate || undefined
    });
    groups.value = [group, ...groups.value];
    selectedGroupId.value = group.id;
    members.value = [];
    expenses.value = [];
    balances.value = [];
    settlements.value = [];
    notice.value = { type: "success", text: "Đã tạo nhóm" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không tạo được nhóm" };
  }
}

async function addMember() {
  if (!selectedGroupId.value || !memberName.value.trim()) return;
  try {
    await api.addMember(selectedGroupId.value, { displayName: memberName.value.trim() });
    memberName.value = "";
    await refreshGroupData();
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không thêm được thành viên" };
  }
}

async function deleteSelectedGroup() {
  if (!selectedGroupId.value || !selectedGroup.value) return;
  if (!window.confirm(`Xoá nhóm "${selectedGroup.value.name}" và toàn bộ dữ liệu liên quan?`)) return;

  try {
    await api.deleteGroup(selectedGroupId.value);
    selectedGroupId.value = null;
    members.value = [];
    expenses.value = [];
    balances.value = [];
    settlements.value = [];
    await refreshGroups();
    notice.value = { type: "success", text: "Đã xoá nhóm" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không xoá được nhóm" };
  }
}

async function deleteMember(member: Member) {
  if (!selectedGroupId.value) return;
  if (!window.confirm(`Xoá thành viên "${member.displayName}"? Thành viên đã có khoản chi/thanh toán sẽ không xoá được.`)) return;

  try {
    await api.deleteMember(selectedGroupId.value, member.id);
    await refreshGroupData();
    notice.value = { type: "success", text: "Đã xoá thành viên" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không xoá được thành viên" };
  }
}

async function togglePublicSharing(publicEnabled: boolean) {
  if (!selectedGroupId.value) return;

  try {
    const updated = await api.updateSharing(selectedGroupId.value, { publicEnabled });
    groups.value = groups.value.map((group) => group.id === updated.id ? updated : group);
    notice.value = {
      type: "success",
      text: publicEnabled ? "Đã bật link public" : "Đã tắt link public"
    };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không cập nhật được chia sẻ" };
  }
}

async function copyPublicLink() {
  if (!publicLink.value) return;
  await navigator.clipboard.writeText(publicLink.value);
  notice.value = { type: "success", text: "Đã copy link public" };
}

function buildParticipants() {
  return selectedParticipantIds.value.map((memberId) => {
    if (expenseForm.splitMethod === "exact") {
      return { memberId, value: toMinorUnits(participantValues[memberId] || 0, currency.value) };
    }
    if (expenseForm.splitMethod === "percentage" || expenseForm.splitMethod === "shares") {
      return { memberId, value: participantValues[memberId] || 0 };
    }
    return { memberId };
  });
}

async function createExpense() {
  if (!selectedGroupId.value) return;
  if (!expenseForm.title.trim()) return notice.value = { type: "error", text: "Nhập tên khoản chi" };
  if (!expenseForm.paidByMemberId) return notice.value = { type: "error", text: "Chọn người trả tiền" };
  if (selectedParticipantIds.value.length === 0) return notice.value = { type: "error", text: "Chọn ít nhất một người tham gia" };

  try {
    await api.createExpense(selectedGroupId.value, {
      title: expenseForm.title.trim(),
      amountMinor: totalMinor.value,
      currency: currency.value,
      paidByMemberId: expenseForm.paidByMemberId,
      splitMethod: expenseForm.splitMethod,
      participants: buildParticipants(),
      note: expenseForm.note || undefined
    });

    expenseForm.title = "";
    expenseForm.amount = 0;
    expenseForm.note = "";
    await refreshGroupData();
    notice.value = { type: "success", text: "Đã thêm khoản chi" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không lưu được khoản chi" };
  }
}

async function markSettlementPaid(settlement: SettlementSuggestion) {
  if (!selectedGroupId.value) return;
  try {
    await api.createPayment(selectedGroupId.value, {
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountMinor: settlement.amountMinor,
      note: "Thanh toán theo đề xuất"
    });
    await refreshGroupData();
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không ghi nhận được thanh toán" };
  }
}

async function deleteExpense(expense: Expense) {
  if (!selectedGroupId.value) return;
  if (!window.confirm(`Xoá khoản chi "${expense.title}"?`)) return;

  try {
    await api.deleteExpense(selectedGroupId.value, expense.id);
    await refreshGroupData();
    notice.value = { type: "success", text: "Đã xoá khoản chi" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không xoá được khoản chi" };
  }
}

async function savePlannedExpense() {
  if (!selectedGroupId.value || !plannedExpenseForm.title.trim()) return;
  try {
    const payload = {
      title: plannedExpenseForm.title.trim(),
      quantity: plannedExpenseForm.quantity || 1,
      unit: plannedExpenseForm.unit.trim() || undefined,
      estimatedAmountMinor: plannedExpenseForm.estimatedAmount
        ? toMinorUnits(plannedExpenseForm.estimatedAmount, currency.value)
        : undefined,
      currency: currency.value,
      note: plannedExpenseForm.note || undefined
    };

    if (editingPlannedId.value) {
      await api.updatePlannedExpense(selectedGroupId.value, editingPlannedId.value, payload);
      notice.value = { type: "success", text: "Đã cập nhật khoản dự trù" };
    } else {
      await api.createPlannedExpense(selectedGroupId.value, payload);
      notice.value = { type: "success", text: "Đã thêm khoản dự trù" };
    }

    cancelEditPlannedExpense();
    await refreshGroupData();
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không lưu được khoản dự trù" };
  }
}

function editPlannedExpense(planned: PlannedExpense) {
  editingPlannedId.value = planned.id;
  plannedExpenseForm.title = planned.title;
  plannedExpenseForm.quantity = planned.quantity;
  plannedExpenseForm.unit = planned.unit || "";
  plannedExpenseForm.estimatedAmount = planned.estimatedAmountMinor
    ? planned.estimatedAmountMinor / Math.pow(10, currency.value === "VND" ? 0 : 2)
    : null;
  plannedExpenseForm.note = planned.note || "";
  document.querySelector(".planned-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEditPlannedExpense() {
  editingPlannedId.value = null;
  plannedExpenseForm.title = "";
  plannedExpenseForm.quantity = 1;
  plannedExpenseForm.unit = "";
  plannedExpenseForm.estimatedAmount = null;
  plannedExpenseForm.note = "";
}

async function deletePlannedExpense(planned: { id: string; title: string }) {
  if (!selectedGroupId.value) return;
  if (!window.confirm(`Xoá khoản dự trù "${planned.title}"?`)) return;
  try {
    await api.deletePlannedExpense(selectedGroupId.value, planned.id);
    await refreshGroupData();
    notice.value = { type: "success", text: "Đã xoá khoản dự trù" };
  } catch (error) {
    notice.value = { type: "error", text: error instanceof Error ? error.message : "Không xoá được khoản dự trù" };
  }
}

function promoteToExpense(planned: { title: string; estimatedAmountMinor?: number }) {
  expenseForm.title = planned.title;
  expenseForm.amount = planned.estimatedAmountMinor
    ? planned.estimatedAmountMinor / Math.pow(10, currency.value === "VND" ? 0 : 2)
    : 0;
  // scroll to expense form
  document.querySelector(".expense-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

watch(
  () => [expenseForm.splitMethod, selectedParticipantIds.value.join(",")],
  () => {
    if (expenseForm.splitMethod === "percentage") {
      const count = selectedParticipantIds.value.length || 1;
      const base = Math.floor(100 / count);
      let remainder = 100 - base * count;
      for (const memberId of selectedParticipantIds.value) {
        participantValues[memberId] = base + (remainder > 0 ? 1 : 0);
        remainder -= 1;
      }
    }

    if (expenseForm.splitMethod === "shares") {
      for (const memberId of selectedParticipantIds.value) {
        participantValues[memberId] = participantValues[memberId] || 1;
      }
    }
  }
);

onMounted(async () => {
  if (isPublicMode) {
    refreshPublicSnapshot();
    return;
  }

  // Check existing session
  authLoading.value = true;
  const { data: { session } } = await supabase.auth.getSession();
  currentUser.value = session?.user ?? null;
  authLoading.value = false;

  // Listen for auth changes
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser.value = session?.user ?? null;
    if (session?.user) {
      refreshGroups();
    } else {
      groups.value = [];
      selectedGroupId.value = null;
    }
  });

  if (currentUser.value) {
    refreshGroups();
  }
});

async function login() {
  loginError.value = "";
  loginSubmitting.value = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password
    });
    if (error) loginError.value = error.message;
  } finally {
    loginSubmitting.value = false;
  }
}

async function logout() {
  await supabase.auth.signOut();
  groups.value = [];
  selectedGroupId.value = null;
  members.value = [];
  expenses.value = [];
  balances.value = [];
  settlements.value = [];
  plannedExpenses.value = [];
}
</script>

<template>
  <n-config-provider :theme="darkTheme">
      <div v-if="isPublicMode" class="public-page">
        <header class="public-header">
          <div>
            <div class="brand compact">
              <div class="brand-mark"><Banknote :size="22" /></div>
              <div>
                <h1>Splitwise Plus</h1>
                <p>Public read-only</p>
              </div>
            </div>
            <h2>{{ publicSnapshot?.group.name ?? 'Public link' }}</h2>
            <p v-if="publicSnapshot">{{ groupDateRange(publicSnapshot.group) }} · cập nhật {{ formatDateTime(publicSnapshot.group.updatedAt) }}</p>
            <p v-if="publicSnapshot">Bản xem công khai, không cho phép chỉnh sửa dữ liệu.</p>
          </div>
          <n-button :loading="publicLoading" @click="refreshPublicSnapshot">
            <template #icon><RefreshCw :size="16" /></template>
            Làm mới
          </n-button>
        </header>

        <n-alert v-if="notice" class="notice" :type="notice.type" :title="notice.text" closable @close="notice = null" />

        <main v-if="publicSnapshot" class="public-grid">
          <!-- Stats -->
          <section class="panel stats-panel public-stats">
            <n-statistic label="Tổng khoản chi" :value="publicSnapshot.expenses.length" />
            <n-statistic label="Thành viên" :value="publicSnapshot.members.length" />
            <n-statistic label="Đề xuất chuyển tiền" :value="publicSnapshot.settlements.length" />
          </section>

          <div class="public-two-col">
            <!-- Balances -->
            <section class="panel balances-panel">
              <div class="panel-title">
                <Banknote :size="18" />
                <h3>Số dư</h3>
              </div>
              <n-empty v-if="publicSnapshot.balances.length === 0" description="Chưa có số dư" />
              <div v-for="balance in publicSnapshot.balances" :key="balance.memberId" class="balance-row">
                <span>{{ snapshotMemberNameById(publicSnapshot, balance.memberId) }}</span>
                <strong :class="balance.amountMinor > 0 ? 'positive' : 'negative'">
                  {{ balance.amountMinor > 0 ? '+' : '' }}{{ formatMoney(balance.amountMinor, publicSnapshot.group.currency) }}
                </strong>
              </div>
            </section>

            <!-- Settlement with bank info + QR -->
            <section class="panel settlement-panel">
              <div class="panel-title">
                <Check :size="18" />
                <h3>Đề xuất thanh toán</h3>
              </div>
              <n-empty v-if="publicSnapshot.settlements.length === 0" description="Không cần thanh toán thêm" />
              <div
                v-for="settlement in publicSnapshot.settlements"
                :key="`${settlement.fromMemberId}-${settlement.toMemberId}-${settlement.amountMinor}`"
                class="settlement-card"
              >
                <div class="settlement-header">
                  <div class="settlement-transfer">
                    <span class="settlement-from">{{ snapshotMemberNameById(publicSnapshot, settlement.fromMemberId) }}</span>
                    <span class="settlement-arrow">→</span>
                    <span class="settlement-to">{{ snapshotMemberNameById(publicSnapshot, settlement.toMemberId) }}</span>
                  </div>
                  <div class="settlement-amount money">{{ formatMoney(settlement.amountMinor, publicSnapshot.group.currency) }}</div>
                </div>

                <!-- Bank info for the recipient -->
                <template v-if="getBankInfo(settlement.toMemberId)">
                  <div class="bank-info-block">
                    <div class="bank-info-text">
                      <div class="bank-info-row">
                        <CreditCard :size="14" />
                        <span class="bank-label">{{ getBankInfo(settlement.toMemberId)!.bankCode }}</span>
                        <span class="bank-account">{{ getBankInfo(settlement.toMemberId)!.accountNumber }}</span>
                      </div>
                      <div class="bank-name">{{ getBankInfo(settlement.toMemberId)!.accountName }}</div>
                    </div>
                    <div class="qr-thumb-wrap">
                      <img
                        class="qr-thumb"
                        :src="vietQrUrl(
                          getBankInfo(settlement.toMemberId)!.bankCode,
                          getBankInfo(settlement.toMemberId)!.accountNumber,
                          getBankInfo(settlement.toMemberId)!.accountName,
                          settlement.amountMinor,
                          publicSnapshot.group.currency,
                          `${snapshotMemberNameById(publicSnapshot, settlement.fromMemberId)} chuyen tien ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)} ${publicSnapshot.group.name}`
                        )"
                        :alt="`QR chuyển tiền cho ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)}`"
                        loading="lazy"
                        @click="openQrLightbox(
                          vietQrUrl(
                            getBankInfo(settlement.toMemberId)!.bankCode,
                            getBankInfo(settlement.toMemberId)!.accountNumber,
                            getBankInfo(settlement.toMemberId)!.accountName,
                            settlement.amountMinor,
                            publicSnapshot.group.currency,
                            `${snapshotMemberNameById(publicSnapshot, settlement.fromMemberId)} chuyen tien ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)} ${publicSnapshot.group.name}`
                          ),
                          `QR chuyển tiền cho ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)}`
                        )"
                      />
                      <button
                        class="qr-expand-btn"
                        title="Phóng to QR"
                        @click="openQrLightbox(
                          vietQrUrl(
                            getBankInfo(settlement.toMemberId)!.bankCode,
                            getBankInfo(settlement.toMemberId)!.accountNumber,
                            getBankInfo(settlement.toMemberId)!.accountName,
                            settlement.amountMinor,
                            publicSnapshot.group.currency,
                            `${snapshotMemberNameById(publicSnapshot, settlement.fromMemberId)} chuyen tien ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)} ${publicSnapshot.group.name}`
                          ),
                          `QR chuyển tiền cho ${snapshotMemberNameById(publicSnapshot, settlement.toMemberId)}`
                        )"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="15 3 21 3 21 9"/>
                          <polyline points="9 21 3 21 3 15"/>
                          <line x1="21" y1="3" x2="14" y2="10"/>
                          <line x1="3" y1="21" x2="10" y2="14"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
                <div v-else class="bank-info-empty">
                  <CreditCard :size="13" />
                  Chưa có thông tin tài khoản
                </div>
              </div>
            </section>
          </div>

          <!-- Expense history -->
          <section class="panel history-panel">
            <div class="panel-title">
              <ReceiptText :size="18" />
              <h3>Lịch sử khoản chi</h3>
            </div>
            <n-empty v-if="publicSnapshot.expenses.length === 0" description="Chưa có khoản chi" />
            <div v-for="expense in publicSnapshot.expenses" :key="expense.id" class="expense-row">
              <div>
                <strong>{{ expense.title }}</strong>
                <p>
                  {{ snapshotMemberNameById(publicSnapshot, expense.paidByMemberId) }} đã trả · {{ expense.splitMethod }}
                  · tạo {{ formatDateTime(expense.createdAt) }}
                </p>
              </div>
              <span>{{ formatMoney(expense.amountMinor, expense.currency) }}</span>
            </div>
          </section>

          <!-- Planned expenses -->
          <section class="panel planned-panel public-planned">
            <div class="panel-title">
              <ClipboardList :size="18" />
              <h3>Dự trù khoản chi</h3>
            </div>
            <n-empty v-if="publicSnapshot.plannedExpenses.length === 0" description="Chưa có khoản dự trù" />
            <div v-for="planned in publicSnapshot.plannedExpenses" :key="planned.id" class="planned-row">
              <div class="planned-info">
                <strong>{{ planned.title }}</strong>
                <small v-if="planned.estimatedAmountMinor">
                  x{{ planned.quantity }} {{ planned.unit || '' }} &times; {{ formatMoney(planned.estimatedAmountMinor, planned.currency) }}
                </small>
                <small v-else-if="planned.quantity > 1 || planned.unit">
                  x{{ planned.quantity }} {{ planned.unit || '' }}
                </small>
                <p v-if="planned.note">{{ planned.note }}</p>
              </div>
              <span class="planned-amount">
                {{ planned.estimatedAmountMinor
                  ? formatMoney(planned.estimatedAmountMinor * planned.quantity, planned.currency)
                  : '—' }}
              </span>
            </div>
          </section>
        </main>
      </div>

      <!-- Loading auth -->
      <div v-else-if="authLoading" class="auth-loading">
        <div class="brand-mark"><Banknote :size="32" /></div>
        <p>Đang xác thực...</p>
      </div>

      <!-- Login screen -->
      <div v-else-if="!currentUser" class="login-page">
        <div class="login-card">
          <div class="login-brand">
            <div class="brand-mark"><Banknote :size="36" /></div>
            <div>
              <h1>Splitwise Plus</h1>
              <p>Chia tiền chính xác đến từng đồng</p>
            </div>
          </div>
          <n-alert v-if="loginError" type="error" :title="loginError" style="margin-bottom: 16px" />
          <n-form-item label="Email">
            <n-input
              v-model:value="loginForm.email"
              type="text"
              placeholder="email@example.com"
              @keyup.enter="login"
            />
          </n-form-item>
          <n-form-item label="Mật khẩu">
            <n-input
              v-model:value="loginForm.password"
              type="password"
              placeholder="••••••••"
              show-password-on="click"
              @keyup.enter="login"
            />
          </n-form-item>
          <n-button type="primary" block size="large" :loading="loginSubmitting" @click="login">
            Đăng nhập
          </n-button>
        </div>
      </div>

      <div v-else class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark"><Banknote :size="24" /></div>
            <div class="brand-text">
              <h1>Splitwise Plus</h1>
              <p>Chia tiền chính xác đến từng đồng</p>
            </div>
            <n-button quaternary size="small" class="logout-btn" @click="logout" title="Đăng xuất">
              <template #icon><LogOut :size="16" /></template>
            </n-button>
          </div>
          <div class="user-info">
            <span>{{ currentUser?.email }}</span>
          </div>

          <n-card size="small" title="Tạo nhóm">
            <n-space vertical>
              <n-input v-model:value="groupForm.name" placeholder="Tên nhóm" />
              <input v-model="groupForm.startDate" class="date-input" type="date" />
              <input v-model="groupForm.endDate" class="date-input" type="date" />
              <n-select
                v-model:value="groupForm.currency"
                :options="[
                  { label: 'VND', value: 'VND' },
                  { label: 'USD', value: 'USD' },
                  { label: 'EUR', value: 'EUR' },
                  { label: 'SGD', value: 'SGD' }
                ]"
              />
              <n-button type="primary" block @click="createGroup">
                <template #icon><Plus :size="16" /></template>
                Tạo nhóm
              </n-button>
            </n-space>
          </n-card>

          <n-divider />

          <n-card v-if="selectedGroup" size="small" title="Chia sẻ public" class="share-card">
            <n-space vertical>
              <n-alert type="info" :show-icon="false">
                Link public chỉ cho xem số dư, khoản chi và đề xuất thanh toán.
              </n-alert>
              <n-input :value="publicLink || 'Chưa bật chia sẻ'" readonly />
              <n-button v-if="!selectedGroup.publicEnabled" block type="primary" @click="togglePublicSharing(true)">
                <template #icon><Share2 :size="16" /></template>
                Bật public link
              </n-button>
              <n-space v-else>
                <n-button @click="copyPublicLink">
                  <template #icon><Copy :size="16" /></template>
                  Copy
                </n-button>
                <n-button tag="a" :href="publicLink" target="_blank">
                  <template #icon><ExternalLink :size="16" /></template>
                  Mở
                </n-button>
                <n-button @click="togglePublicSharing(false)">
                  <template #icon><EyeOff :size="16" /></template>
                  Tắt
                </n-button>
              </n-space>
            </n-space>
          </n-card>

          <n-divider v-if="selectedGroup" />

          <div class="section-label">Nhóm hiện có</div>
          <n-list hoverable clickable>
            <n-list-item
              v-for="group in groups"
              :key="group.id"
              :class="{ active: group.id === selectedGroupId }"
              @click="selectedGroupId = group.id; refreshGroupData()"
            >
              <div class="group-row">
                <span>{{ group.name }}</span>
                <div class="group-meta">
                  <small>{{ formatDate(group.startDate) }}</small>
                  <n-tag size="small">{{ group.currency }}</n-tag>
                </div>
              </div>
            </n-list-item>
          </n-list>
        </aside>

        <section class="content">
          <header class="topbar">
            <div>
              <h2>{{ selectedGroup?.name ?? 'Tạo nhóm để bắt đầu' }}</h2>
              <p v-if="selectedGroup">Quản lý khoản chi, số dư và đề xuất thanh toán tối giản.</p>
              <p v-if="selectedGroup">{{ groupDateRange(selectedGroup) }} · tạo {{ formatDateTime(selectedGroup.createdAt) }}</p>
            </div>
            <n-button :disabled="!selectedGroupId" :loading="loading" @click="refreshGroupData">
              <template #icon><RefreshCw :size="16" /></template>
              Làm mới
            </n-button>
            <n-button v-if="selectedGroup" type="error" secondary @click="deleteSelectedGroup">
              <template #icon><Trash2 :size="16" /></template>
              Xoá nhóm
            </n-button>
          </header>

          <n-alert v-if="notice" class="notice" :type="notice.type" :title="notice.text" closable @close="notice = null" />

          <n-alert v-if="!selectedGroupId" type="info" title="Chưa có nhóm">
            Tạo một nhóm bên trái, thêm thành viên, sau đó nhập khoản chi để hệ thống đề xuất ai cần chuyển tiền cho ai.
          </n-alert>

          <main v-else class="grid">
            <section class="panel members-panel">
              <div class="panel-title">
                <UsersRound :size="18" />
                <h3>Thành viên</h3>
              </div>
              <div class="inline-form">
                <n-input v-model:value="memberName" placeholder="Tên thành viên" @keyup.enter="addMember" />
                <n-button type="primary" @click="addMember"><Plus :size="16" /></n-button>
              </div>
              <div class="member-list">
                <div v-for="member in members" :key="member.id" class="member-chip">
                  <span>{{ member.displayName }}</span>
                  <small>{{ formatDate(member.joinedAt) }}</small>
                  <button
                    type="button"
                    class="icon-action bank-btn"
                    :class="{ 'bank-set': !!getBankInfo(member.id) }"
                    :aria-label="getBankInfo(member.id) ? 'Sửa tài khoản ngân hàng' : 'Thêm tài khoản ngân hàng'"
                    :title="getBankInfo(member.id) ? `${getBankInfo(member.id)!.bankCode} ${getBankInfo(member.id)!.accountNumber}` : 'Thiết lập tài khoản ngân hàng'"
                    @click="openBankInfoModal(member)"
                  >
                    <CreditCard :size="14" />
                  </button>
                  <button type="button" class="icon-action" aria-label="Xoá thành viên" @click="deleteMember(member)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </section>

            <section class="panel expense-panel">
              <div class="panel-title">
                <ReceiptText :size="18" />
                <h3>Thêm khoản chi</h3>
              </div>
              <div class="expense-grid">
                <n-form-item label="Tên khoản chi">
                  <n-input v-model:value="expenseForm.title" placeholder="Ví dụ: Ăn tối" />
                </n-form-item>
                <n-form-item label="Số tiền">
                  <n-input-number
                    v-model:value="expenseForm.amount"
                    :min="0"
                    class="full"
                    :format="(v) => v === null ? '' : new Intl.NumberFormat('vi-VN').format(v)"
                    :parse="(s) => { const n = Number(s.replace(/\./g, '').replace(/,/g, '.')); return isNaN(n) ? 0 : n; }"
                  />
                </n-form-item>
                <n-form-item label="Người trả">
                  <n-select v-model:value="expenseForm.paidByMemberId" :options="memberOptions" />
                </n-form-item>
                <n-form-item label="Cách chia">
                  <n-select
                    v-model:value="expenseForm.splitMethod"
                    :options="[
                      { label: 'Chia đều', value: 'equal' },
                      { label: 'Nhập số tiền', value: 'exact' },
                      { label: 'Theo phần trăm', value: 'percentage' },
                      { label: 'Theo phần', value: 'shares' }
                    ]"
                  />
                </n-form-item>
              </div>

              <div class="participant-table">
                <div v-for="member in members" :key="member.id" class="participant-row">
                  <n-checkbox
                    :checked="selectedParticipantIds.includes(member.id)"
                    @update:checked="(checked) => checked
                      ? selectedParticipantIds.push(member.id)
                      : selectedParticipantIds = selectedParticipantIds.filter((id) => id !== member.id)"
                  >
                    {{ member.displayName }}
                  </n-checkbox>
                  <n-input-number
                    v-if="expenseForm.splitMethod !== 'equal' && selectedParticipantIds.includes(member.id)"
                    v-model:value="participantValues[member.id]"
                    :min="0"
                    size="small"
                  />
                  <span class="preview">{{ formatMoney(participantAmountPreview(member.id), currency) }}</span>
                </div>
              </div>

              <div class="allocation-bar">
                <span>Đã phân bổ: {{ formatMoney(allocatedMinor, currency) }}</span>
                <span :class="{ mismatch: allocationDelta !== 0 }">Chênh lệch: {{ formatMoney(allocationDelta, currency) }}</span>
                <span v-if="expenseForm.splitMethod === 'percentage'" :class="{ mismatch: percentageTotal !== 100 }">
                  Tổng %: {{ percentageTotal }}
                </span>
              </div>

              <n-button type="primary" size="large" block :disabled="members.length < 1" @click="createExpense">
                <template #icon><Plus :size="17" /></template>
                Lưu khoản chi
              </n-button>
            </section>

            <section class="panel stats-panel">
              <n-statistic label="Tổng khoản chi" :value="expenses.length" />
              <n-statistic label="Thành viên" :value="members.length" />
              <n-statistic label="Đề xuất chuyển tiền" :value="settlements.length" />
            </section>

            <section class="panel balances-panel">
              <div class="panel-title">
                <Banknote :size="18" />
                <h3>Số dư</h3>
              </div>
              <n-empty v-if="balances.length === 0" description="Chưa có số dư" />
              <div v-for="balance in balances" :key="balance.memberId" class="balance-row">
                <span>{{ memberNameById(balance.memberId) }}</span>
                <strong :class="balance.amountMinor > 0 ? 'positive' : 'negative'">
                  {{ balance.amountMinor > 0 ? '+' : '' }}{{ formatMoney(balance.amountMinor, currency) }}
                </strong>
              </div>
            </section>

            <section class="panel settlement-panel">
              <div class="panel-title">
                <Check :size="18" />
                <h3>Đề xuất thanh toán</h3>
              </div>
              <n-empty v-if="settlements.length === 0" description="Không cần thanh toán thêm" />
              <div v-for="settlement in settlements" :key="`${settlement.fromMemberId}-${settlement.toMemberId}-${settlement.amountMinor}`" class="settlement-row">
                <div>
                  <strong>{{ memberNameById(settlement.fromMemberId) }}</strong>
                  chuyển cho
                  <strong>{{ memberNameById(settlement.toMemberId) }}</strong>
                  <div class="money">{{ formatMoney(settlement.amountMinor, currency) }}</div>
                </div>
                <n-button size="small" @click="markSettlementPaid(settlement)">Đã trả</n-button>
              </div>
            </section>

            <section class="panel history-panel">
              <div class="panel-title">
                <ReceiptText :size="18" />
                <h3>Lịch sử khoản chi</h3>
              </div>
              <n-empty v-if="expenses.length === 0" description="Chưa có khoản chi" />
              <div v-for="expense in expenses" :key="expense.id" class="expense-row">
                <div>
                  <strong>{{ expense.title }}</strong>
                  <p>
                    {{ memberNameById(expense.paidByMemberId) }} đã trả · {{ expense.splitMethod }}
                    · tạo {{ formatDateTime(expense.createdAt) }}
                  </p>
                </div>
                <div class="row-actions">
                  <span>{{ formatMoney(expense.amountMinor, expense.currency) }}</span>
                  <n-button size="small" type="error" secondary @click="deleteExpense(expense)">
                    <template #icon><Trash2 :size="14" /></template>
                    Xoá
                  </n-button>
                </div>
              </div>
            </section>

            <section class="panel planned-panel">
              <div class="panel-title">
                <ClipboardList :size="18" />
                <h3>Dự trù khoản chi</h3>
              </div>
              <div class="inline-form planned-form">
                <n-input v-model:value="plannedExpenseForm.title" placeholder="Tên khoản dự trù" @keyup.enter="savePlannedExpense" />
                <n-input-number
                  v-model:value="plannedExpenseForm.quantity"
                  :min="0"
                  :step="0.1"
                  placeholder="SL"
                  style="width: 80px"
                  :format="(v) => v === null ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v)"
                  :parse="(s) => { const n = Number(s.replace(/,/g, '.')); return isNaN(n) ? null : n; }"
                />
                <n-input
                  v-model:value="plannedExpenseForm.unit"
                  placeholder="Đơn vị"
                  style="width: 80px"
                  @keyup.enter="savePlannedExpense"
                />
                <n-input-number
                  v-model:value="plannedExpenseForm.estimatedAmount"
                  :min="0"
                  placeholder="Đơn giá"
                  :format="(v) => v === null ? '' : new Intl.NumberFormat('vi-VN').format(v)"
                  :parse="(s) => { const n = Number(s.replace(/\./g, '').replace(/,/g, '.')); return isNaN(n) ? null : n; }"
                />
                <div class="planned-form-actions">
                  <n-button v-if="editingPlannedId" type="default" @click="cancelEditPlannedExpense">Huỷ</n-button>
                  <n-button type="primary" @click="savePlannedExpense">
                    <template v-if="!editingPlannedId"><Plus :size="16" /></template>
                    <template v-else><Check :size="16" /></template>
                  </n-button>
                </div>
              </div>
              <n-input v-model:value="plannedExpenseForm.note" placeholder="Ghi chú (tuỳ chọn)" class="planned-note-input" />
              <n-empty v-if="plannedExpenses.length === 0" description="Chưa có khoản dự trù" />
              <div v-for="planned in plannedExpenses" :key="planned.id" class="planned-row">
                <div class="planned-info">
                  <strong>{{ planned.title }}</strong>
                  <small v-if="planned.estimatedAmountMinor">
                    x{{ planned.quantity }} {{ planned.unit || '' }} &times; {{ formatMoney(planned.estimatedAmountMinor, planned.currency) }}
                  </small>
                  <small v-else-if="planned.quantity > 1 || planned.unit">
                    x{{ planned.quantity }} {{ planned.unit || '' }}
                  </small>
                  <p v-if="planned.note">{{ planned.note }}</p>
                </div>
                <div class="row-actions">
                  <span class="planned-amount">
                    {{ planned.estimatedAmountMinor
                      ? formatMoney(planned.estimatedAmountMinor * planned.quantity, planned.currency)
                      : '—' }}
                  </span>
                  <n-button size="small" @click="promoteToExpense(planned)">Chốt</n-button>
                  <n-button size="small" secondary @click="editPlannedExpense(planned)">Sửa</n-button>
                  <n-button size="small" type="error" secondary @click="deletePlannedExpense(planned)">
                    <template #icon><Trash2 :size="14" /></template>
                  </n-button>
                </div>
              </div>
            </section>
          </main>
        </section>
      </div>

      <!-- Bank info modal -->
      <n-modal
        v-model:show="bankInfoModal.open"
        preset="card"
        style="max-width: 420px; width: 92vw"
        :title="`Tài khoản: ${bankInfoModal.memberName}`"
        :bordered="false"
      >
        <n-space vertical>
          <n-form-item label="Ngân hàng">
            <n-select
              v-model:value="bankInfoModal.bankCode"
              :options="VIET_BANKS"
              filterable
              placeholder="Chọn ngân hàng"
            />
          </n-form-item>
          <n-form-item label="Số tài khoản">
            <n-input
              v-model:value="bankInfoModal.accountNumber"
              placeholder="Ví dụ: 0123456789"
              @keyup.enter="saveBankInfo"
            />
          </n-form-item>
          <n-form-item label="Tên chủ tài khoản">
            <n-input
              v-model:value="bankInfoModal.accountName"
              placeholder="Như in trên tài khoản ngân hàng"
              @keyup.enter="saveBankInfo"
            />
          </n-form-item>
          <n-alert v-if="bankInfoModal.bankCode && bankInfoModal.accountNumber" type="info" :show-icon="false" style="font-size: 12px">
            Mã QR VietQR sẽ tự động hiện trong trang public khi người khác cần chuyển tiền cho thành viên này.
          </n-alert>
          <!-- QR preview -->
          <div v-if="bankInfoModal.bankCode && bankInfoModal.accountNumber" class="qr-preview-wrap">
            <img
              :src="vietQrUrl(bankInfoModal.bankCode, bankInfoModal.accountNumber, bankInfoModal.accountName, 0, 'VND', 'Xem truoc QR')"
              alt="Xem trước QR"
              class="qr-preview"
            />
          </div>
          <n-button type="primary" block @click="saveBankInfo">Lưu tài khoản</n-button>
          <n-button block @click="bankInfoModal.open = false">Huỷ</n-button>
        </n-space>
      </n-modal>

      <!-- QR Lightbox -->
      <Teleport to="body">
        <Transition name="qr-lightbox">
          <div
            v-if="qrLightbox"
            class="qr-lightbox-backdrop"
            @click.self="closeQrLightbox"
          >
            <div class="qr-lightbox-box">
              <button class="qr-lightbox-close" @click="closeQrLightbox" title="Đóng">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <img
                :src="qrLightbox.src"
                :alt="qrLightbox.alt"
                class="qr-lightbox-img"
              />
              <p class="qr-lightbox-caption">{{ qrLightbox.alt }}</p>
            </div>
          </div>
        </Transition>
      </Teleport>
  </n-config-provider>
</template>
