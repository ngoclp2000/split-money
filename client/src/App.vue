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
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  darkTheme
} from "naive-ui";
import { Banknote, Check, Copy, ExternalLink, EyeOff, Plus, ReceiptText, RefreshCw, Share2, Trash2, UsersRound } from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api, type Balance, type Expense, type Group, type GroupSnapshot, type Member, type SettlementSuggestion, type SplitMethod } from "./api";
import { formatMoney, toMinorUnits } from "./money";

const notice = ref<{ type: "success" | "error"; text: string } | null>(null);

const groups = ref<Group[]>([]);
const selectedGroupId = ref<string | null>(null);
const members = ref<Member[]>([]);
const expenses = ref<Expense[]>([]);
const balances = ref<Balance[]>([]);
const settlements = ref<SettlementSuggestion[]>([]);
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
    const [nextMembers, nextExpenses, nextBalances, nextSettlements] = await Promise.all([
      api.listMembers(groupId),
      api.listExpenses(groupId),
      api.listBalances(groupId),
      api.listSettlementSuggestions(groupId)
    ]);
    members.value = nextMembers;
    expenses.value = nextExpenses;
    balances.value = nextBalances;
    settlements.value = nextSettlements;
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

onMounted(() => {
  if (isPublicMode) {
    refreshPublicSnapshot();
    return;
  }

  refreshGroups();
});
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

        <main v-if="publicSnapshot" class="grid public-grid">
          <section class="panel stats-panel">
            <n-statistic label="Tổng khoản chi" :value="publicSnapshot.expenses.length" />
            <n-statistic label="Thành viên" :value="publicSnapshot.members.length" />
            <n-statistic label="Đề xuất chuyển tiền" :value="publicSnapshot.settlements.length" />
          </section>

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

          <section class="panel settlement-panel">
            <div class="panel-title">
              <Check :size="18" />
              <h3>Đề xuất thanh toán</h3>
            </div>
            <n-empty v-if="publicSnapshot.settlements.length === 0" description="Không cần thanh toán thêm" />
            <div v-for="settlement in publicSnapshot.settlements" :key="`${settlement.fromMemberId}-${settlement.toMemberId}-${settlement.amountMinor}`" class="settlement-row">
              <div>
                <strong>{{ snapshotMemberNameById(publicSnapshot, settlement.fromMemberId) }}</strong>
                chuyển cho
                <strong>{{ snapshotMemberNameById(publicSnapshot, settlement.toMemberId) }}</strong>
                <div class="money">{{ formatMoney(settlement.amountMinor, publicSnapshot.group.currency) }}</div>
              </div>
            </div>
          </section>

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
        </main>
      </div>

      <div v-else class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark"><Banknote :size="24" /></div>
            <div>
              <h1>Splitwise Plus</h1>
              <p>Chia tiền chính xác đến từng đồng</p>
            </div>
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
                  <n-input-number v-model:value="expenseForm.amount" :min="0" class="full" />
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
          </main>
        </section>
      </div>
  </n-config-provider>
</template>
