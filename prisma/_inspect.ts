import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const tables = ["User","Session","Wallet","Transaction","LedgerEntry","Remittance","CashOperation","AgentProfile","CommissionEntry","SavingsJar","Beneficiary","Notification","SupportTicket","TicketMessage","AuditLog","LimitRule","FeeRule","FxRate","ServiceState","OtpCode","KycSubmission"]
for (const t of tables as const) {
  try {
    const c = await (db as any)[t].count()
    console.log(t, c)
  } catch (e) { console.log(t, "ERR", (e as Error).message.slice(0, 80)) }
}
await db.$disconnect()
