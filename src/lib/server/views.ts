/**
 * محفظة الجنوب — مصمّمات نماذج العرض (rows → api-types Views)
 * تحويل صرف يعتمد عليه كل المسارات وprisma/seed.ts
 */
import type {
  AgentProfile,
  AuditLog,
  Beneficiary,
  CashOperation,
  CommissionEntry,
  FeeRule,
  FxRate,
  KycSubmission,
  LedgerEntry,
  LimitRule,
  Notification,
  Remittance,
  SavingsJar,
  ServiceState,
  Session,
  SupportTicket,
  TicketMessage,
  Transaction,
  User,
  Wallet,
} from "@prisma/client";
import type {
  AdminAuditRow,
  AdminFeeRow,
  AdminFxRow,
  AdminKycRow,
  AdminLimitRow,
  AdminServiceRow,
  AdminTxRow,
  AgentView,
  BeneficiaryView,
  CashOperationView,
  CommissionEntryView,
  CurrencyCode,
  FxRateView,
  KycSubmissionView,
  LedgerLineView,
  NotificationView,
  PublicUser,
  RemittanceView,
  SavingsJarView,
  ServiceStateView,
  SessionView,
  TicketMessageView,
  TicketView,
  TxStatus,
  TxType,
  TxView,
  UserRole,
  WalletView,
} from "../api-types";
import { maskIdNumber, maskPhone } from "./domain";

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role as UserRole,
    status: u.status as PublicUser["status"],
    kycLevel: u.kycLevel as PublicUser["kycLevel"],
    scopeRestricted: u.scopeRestricted,
    governorate: u.governorate,
    biometricEnabled: u.biometricEnabled,
    hasPin: u.pinHash !== null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toWalletView(w: Wallet): WalletView {
  return {
    currency: w.currency as CurrencyCode,
    kind: "MAIN",
    balanceMinor: w.balanceMinor,
  };
}

export function toTxView(t: Transaction): TxView {
  return {
    ref: t.ref,
    type: t.type as TxType,
    status: t.status as TxStatus,
    currency: t.currency as CurrencyCode,
    amountMinor: t.amountMinor,
    feeMinor: t.feeMinor,
    direction: t.direction as "DEBIT" | "CREDIT",
    counterpartyName: t.counterpartyName,
    counterpartyPhone: t.counterpartyPhone,
    description: t.description,
    relatedRef: t.relatedRef,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

export function toAdminTxRow(t: Transaction, user: Pick<User, "id" | "phone" | "fullName">): AdminTxRow {
  return {
    ...toTxView(t),
    userId: user.id,
    userPhone: user.phone,
    userName: user.fullName,
  };
}

export function toKycView(k: KycSubmission): KycSubmissionView {
  return {
    id: k.id,
    fullName: k.fullName,
    idType: k.idType as KycSubmissionView["idType"],
    idNumberMasked: maskIdNumber(k.idNumber),
    governorate: k.governorate,
    status: k.status as KycSubmissionView["status"],
    reviewNote: k.reviewNote,
    submittedAt: k.submittedAt.toISOString(),
    reviewedAt: k.reviewedAt ? k.reviewedAt.toISOString() : null,
  };
}

export function toAdminKycRow(k: KycSubmission, phone: string): AdminKycRow {
  return {
    id: k.id,
    userId: k.userId,
    fullName: k.fullName,
    phone,
    idType: k.idType as AdminKycRow["idType"],
    idNumberMasked: maskIdNumber(k.idNumber),
    governorate: k.governorate,
    occupation: k.occupation,
    monthlyIncomeMinor: k.monthlyIncomeMinor,
    incomeCurrency: k.incomeCurrency,
    submittedAt: k.submittedAt.toISOString(),
  };
}

export function toRemittanceView(
  r: Remittance,
  payingAgentName: string | null = null
): RemittanceView {
  return {
    id: r.id,
    ref: r.ref,
    receiverName: r.receiverName,
    receiverPhone: r.receiverPhone,
    currency: r.currency as CurrencyCode,
    amountMinor: r.amountMinor,
    feeMinor: r.feeMinor,
    deliveryCode: r.deliveryCode,
    status: r.status as RemittanceView["status"],
    payingAgentName,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export function toCashOpView(
  op: CashOperation,
  agentProfile: AgentProfile | null,
  agentOwnerName: string | null
): CashOperationView {
  return {
    id: op.id,
    ref: op.ref,
    type: op.type as CashOperationView["type"],
    currency: op.currency as CurrencyCode,
    amountMinor: op.amountMinor,
    feeMinor: op.feeMinor,
    code: op.code,
    status: op.status as TxStatus,
    agentName: agentOwnerName ?? agentProfile?.shopName ?? "وكيل",
    agentShop: agentProfile?.shopName ?? "—",
    agentCode: agentProfile?.code ?? "—",
    expiresAt: op.expiresAt.toISOString(),
    processedAt: op.processedAt ? op.processedAt.toISOString() : null,
    createdAt: op.createdAt.toISOString(),
  };
}

export function toAgentView(p: AgentProfile): AgentView {
  return {
    id: p.id,
    code: p.code,
    shopName: p.shopName,
    governorate: p.governorate,
    district: p.district,
    address: p.address,
    status: p.status as AgentView["status"],
  };
}

export function toSavingsJarView(jar: SavingsJar, savedMinor: number): SavingsJarView {
  const progress =
    jar.targetMinor && jar.targetMinor > 0
      ? Math.min(100, Math.round((savedMinor / jar.targetMinor) * 100))
      : null;
  return {
    id: jar.id,
    name: jar.name,
    targetMinor: jar.targetMinor,
    currency: jar.currency as CurrencyCode,
    savedMinor,
    progress,
    status: jar.status as SavingsJarView["status"],
    createdAt: jar.createdAt.toISOString(),
  };
}

export function toNotificationView(n: Notification): NotificationView {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    category: n.category as NotificationView["category"],
    read: n.read,
    txRef: n.txRef,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toBeneficiaryView(b: Beneficiary): BeneficiaryView {
  return {
    id: b.id,
    name: b.name,
    phone: b.phone,
    createdAt: b.createdAt.toISOString(),
  };
}

export function toTicketView(
  t: SupportTicket & { messages?: TicketMessage[]; _count?: { messages: number } }
): TicketView {
  const count = t._count?.messages ?? t.messages?.length ?? 0;
  const lastMessage = t.messages && t.messages.length > 0 ? t.messages[t.messages.length - 1].body : null;
  return {
    id: t.id,
    ref: t.ref,
    subject: t.subject,
    category: t.category,
    status: t.status as TicketView["status"],
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastMessage,
    messagesCount: count,
  };
}

export function toTicketMessageView(m: TicketMessage, authorName: string | null): TicketMessageView {
  return {
    id: m.id,
    authorName: authorName ?? "مستخدم",
    authorRole: m.authorRole as UserRole,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toServiceStateView(s: ServiceState): ServiceStateView {
  return {
    key: s.key,
    state: s.state as ServiceStateView["state"],
    note: s.note,
  };
}

export function toAdminServiceRow(s: ServiceState): AdminServiceRow {
  return {
    id: s.id,
    key: s.key,
    state: s.state as AdminServiceRow["state"],
    note: s.note,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toFxRateView(r: FxRate): FxRateView {
  return {
    fromCurrency: r.fromCurrency as CurrencyCode,
    toCurrency: r.toCurrency as CurrencyCode,
    rate: r.rate / 1_000_000,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toAdminFxRow(r: FxRate): AdminFxRow {
  return {
    id: r.id,
    fromCurrency: r.fromCurrency as CurrencyCode,
    toCurrency: r.toCurrency as CurrencyCode,
    rate: r.rate / 1_000_000,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toAdminLimitRow(r: LimitRule): AdminLimitRow {
  return {
    id: r.id,
    kycLevel: r.kycLevel as AdminLimitRow["kycLevel"],
    currency: r.currency as CurrencyCode,
    dailyTxnCount: r.dailyTxnCount,
    dailyAmountMinor: r.dailyAmountMinor,
    perTxnAmountMinor: r.perTxnAmountMinor,
  };
}

export function toAdminFeeRow(r: FeeRule): AdminFeeRow {
  return {
    id: r.id,
    opType: r.opType,
    currency: r.currency as CurrencyCode,
    pctBps: r.pctBps,
    fixedMinor: r.fixedMinor,
    minFeeMinor: r.minFeeMinor,
    maxFeeMinor: r.maxFeeMinor,
  };
}

export function toAdminAgentRow(
  p: AgentProfile,
  ownerPhone: string,
  ownerName: string | null,
  floatMinor: number,
  commissionTotalMinor: number
): AdminAgentRow {
  return {
    id: p.id,
    userId: p.userId,
    code: p.code,
    shopName: p.shopName,
    ownerName,
    phone: ownerPhone,
    governorate: p.governorate,
    district: p.district,
    status: p.status as AdminAgentRow["status"],
    floatMinor,
    commissionBps: p.commissionBps,
    commissionTotalMinor,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toAdminAuditRow(a: AuditLog, actorName: string | null): AdminAuditRow {
  return {
    id: a.id,
    actorName: actorName ?? "—",
    actorRole: a.actorRole as UserRole,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toCommissionEntryView(c: CommissionEntry): CommissionEntryView {
  return {
    id: c.id,
    opType: c.opType as CommissionEntryView["opType"],
    sourceRef: c.sourceRef,
    amountMinor: c.amountMinor,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toLedgerLineView(e: LedgerEntry): LedgerLineView {
  return {
    walletId: e.walletId,
    direction: e.direction as "DEBIT" | "CREDIT",
    amountMinor: e.amountMinor,
    balanceAfterMinor: e.balanceAfterMinor,
    currency: e.currency as CurrencyCode,
  };
}

export function toSessionView(s: Session, current: boolean): SessionView {
  return {
    id: s.id,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    current,
  };
}

export function toAdminUserRow(
  u: User,
  balancesYER: number
): AdminUserRow {
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role as UserRole,
    status: u.status as AdminUserRow["status"],
    kycLevel: u.kycLevel as AdminUserRow["kycLevel"],
    scopeRestricted: u.scopeRestricted,
    governorate: u.governorate,
    createdAt: u.createdAt.toISOString(),
    balancesYER,
  };
}

/** هاتف مقنّع للعرض (770123•••) */
export function maskedPhone(phone: string): string {
  return maskPhone(phone);
}
