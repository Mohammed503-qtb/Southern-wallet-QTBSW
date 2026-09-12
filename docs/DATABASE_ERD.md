# مخطط قاعدة البيانات وERD — محفظة الجنوب

## بطاقة الوثيقة

| البند | القيمة |
|---|---|
| اسم المنتج | محفظة الجنوب — South Wallet |
| معرّف الحزمة (Package Name) | `com.janoub.wallet` |
| عنوان الوثيقة | مخطط قاعدة البيانات وERD — Database Schema & ERD |
| إصدار الوثيقة | 1.0 |
| حالة الوثيقة | مسودة أولى بانتظار اعتماد صاحب المنتج والمعماري |
| المحرك | PostgreSQL 15+ (معاملات ACID + قيود مرجعية صارمة + Declarative Partitioning) |
| نوع الوثيقة | وثيقة تصميم DDL للمنتج النهائي — ليست لمشروع Next.js الحالي، ولا Prisma ولا SQLite |
| المرجع الحاكم | Master PLAN.md (`upload/Pasted Content_1789156753860.txt`) — القسم 71 (الكيانات الإلزامية) والأقسام 4–123 |
| المرجع التعاقدي | `docs/SRS.md` v1.0 — §3 (FR-GEO)، §4.1–4.19 (وحدات FR)، §5 (FR-ADM)، ملحق أ (آلات الحالة) |
| حجم المخطط | 78 جدولاً في 9 مجموعات + 45 نوع ENUM + 98 علاقة مُوثّقة |
| قاعدة التنفيذ | Migrations مُصدَّرة فقط (NFR-MNT-002) — يُمنع أي DDL يدوي على الإنتاج |
| لغة الوثيقة | العربية (أساس) مع المصطلحات والـDDL بحروف لاتينية |

---

# 1. مبادئ التصميم

كل قاعدة أدناه قيد حاكم على كل جدول في هذه الوثيقة، وكل منها مستمد من Master PLAN أو من قواعد SRS الجوهرية (R-01..R-14):

| # | القاعدة | التطبيق في المخطط | المرجع |
|---|---|---|---|
| P-01 | الخادم + Ledger هما مصدر الحقيقة المالية | كل مبلغ في `wallet_balances` توازنه قيود في `ledger_entries`؛ التطبيق لا يولّد رصيداً | R-01، Master §3/§12 |
| P-02 | Double-Entry Ledger | كل معاملة = قيدان أو أكثر (DEBIT/CREDIT) على `ledger_accounts`؛ مجموع المدين = الدائن لكل معاملة (فرض application-level + فحص Reconciliation دوري) | Master §14/§76، FR-LDG-001/002 |
| P-03 | Atomicity | تنفيذ المعاملة داخل معاملة قاعدة واحدة مع `SELECT ... FOR UPDATE` على صف `wallet_balances` — كلها أو لا شيء | Master §15، FR-LDG-003 |
| P-04 | Idempotency | جدول `idempotency_keys` بـ `UNIQUE(idem_key, endpoint)` يحفظ مرجع الاستجابة — نفس المفتاح = نفس النتيجة | Master §16/§103، FR-LDG-004 |
| P-05 | Append-only للبيانات المالية والتدقيق | لا UPDATE/DELETE على `transactions` و`ledger_entries` و`transaction_items` و`transaction_status_history` و`audit_logs` (تُلغى صلاحيات التعديل)؛ التصحيح بـ Reversal مرتبط بالأصل | R-04، Master §75/§90 |
| P-06 | لا زر «تعديل رصيد» | كل تعديل مالي عبر `adjustment_requests` (مبلغ + سبب + مرجع + موافقة Maker-Checker) → معاملة → قيد Ledger + Audit | R-05، Master §43 |
| P-07 | الأعمدة القياسية للكيانات الإدارية | كل كيان إداري: `id UUID PK` + `created_at/updated_at/created_by/updated_by` + `status`؛ و`deleted_at` للمحتوى فقط | Master §89 |
| P-08 | المبالغ والعملات | المبالغ `NUMERIC(18,4)` مع فصل `currency_code CHAR(3)` ISO (YER/SAR/USD) — لا دمج العملة في رقم واحد | SRS §8، FR-WLT |
| P-09 | آلات الحالة كأنواع ENUM | 45 نوع `CREATE TYPE` (ملحق أ SRS)؛ الانتقالات تُفرض في طبقة التطبيق ويُدوَّن كل انتقال في `transaction_status_history` و`audit_logs` | ملحق أ، Master §17 |
| P-10 | مرجع المعاملة | `reference` بصيغة `SW-YYYYMMDD-XXXXXXXX` مع CHECK + جدول `transaction_references` يضمن التفرد العالمي عبر الأقسام الشهرية | Master §73 |
| P-11 | قيود مرجعية صارمة | كل FK مسمّى بـ `ON DELETE RESTRICT` افتراضياً — لا حذف متسلسل لأي بيانات مالية أو مرجعية | R-14 |
| P-12 | لقطة الرسوم/الأسعار | `fee_rule_id + fee_rule_version + fee_amount` و`exchange_rate_id + exchange_rate_value` تُثبَّت داخل المعاملة فلا تتأثر العمليات القديمة بتغيير الإدارة | Master §37، FR-ADM-024/027 |
| P-13 | Metadata لقطة JSONB | `transactions.metadata` يحفظ كل ما يفسّر المعاملة لاحقاً (القسم 74) دون الاعتماد على بيانات حالية قابلة للتغير | Master §74 |
| P-14 | التقسيم والأرشفة | تقسيم شهري (Declarative Partitioning) لـ `transactions` و`ledger_entries`؛ لا حذف مالي لأجل السعة — أرشفة تقارير فقط | Master §121 |
| P-15 | حساسية البيانات | `pin_hash/otp_hash/withdrawal_code_hash/delivery_code_hash` هاش فقط (argon2/bcrypt)؛ مستندات KYC = Metadata في القاعدة + ملف في Storage موقّع؛ أكواد الكروت مشفّرة BYTEA بمفتاح KMS خارجي | Master §81/§122، NFR-SEC-002/003 |
| P-16 | الأهلية متعددة الإشارات | `regions/districts/eligibility_policies` مركزية؛ GPS إشارة مساعدة فقط؛ كل قرار يُدوَّن في `audit_logs` | R-06، Master §4، FR-GEO-004/014 |

---

# 2. خريطة المجموعات (Domains)

| # | المجموعة | الجداول (العدد) | الغرض |
|---|---|---|---|
| D1 | الهوية والحساب | users, profiles, otp_codes, devices, sessions, push_tokens, favorites, kyc_profiles, kyc_documents, idempotency_keys (10) | المستخدم النهائي وجلساته وأجهزته وتوثيقه وتماثل طلباته |
| D2 | الجغرافيا والأهلية | regions, districts, eligibility_policies (3) | نطاق الخدمة الثماني والسياسات المركزية القابلة للإدارة دون إصدار جديد |
| D3 | المالية الأساسية (Wallet + Ledger) | currencies, exchange_rates, ledger_accounts, wallets, wallet_balances, ledger_entries (6) | العملات والأسعار ودليل الحسابات والمحافظ والأرصدة وقيود الدفتر |
| D4 | المعاملات والطلبات | fee_rules, limit_rules, transactions, transaction_references, transaction_items, transaction_status_history, deposit_requests, withdrawal_requests, payments, remittance_orders, remittance_deliveries, adjustment_requests, provider_webhook_events (13) | محرك المعاملات المركزي وكل أنواع الطلبات وقواعد الرسوم والحدود |
| D5 | الشبكات والوكلاء والتجار | agents, agent_float_accounts, agent_commission_rules, agent_daily_settlements, merchants, merchant_branches, terminals, qr_codes, merchant_settlements, networks, network_products (11) | الوكلاء وFloat والعمولات والتسوية، التجار وفروعهم ونقاط البيع وQR، شبكات الجوال |
| D6 | الخدمات (شحن/فواتير/كروت/حصالة) | services, topups, network_cards, network_card_sales, bill_providers, bill_products, bill_payments, savings_accounts, savings_transactions, digital_assets, blockchain_networks, crypto_addresses, crypto_transactions (13) | محرك الخدمات الموحد وكل خدمة بكياناتها (العملات الرقمية مؤجلة FR-CRY) |
| D7 | الدعم والمحتوى | notification_templates, notifications, support_tickets, support_messages, content, banners, faqs (7) | الإشعارات والتذاكر والمحتوى المنفصل عن الكود |
| D8 | الإدارة والصلاحيات | roles, permissions, role_permissions, admin_users, admin_sessions, feature_flags, system_settings, system_state, app_versions (9) | RBAC (Role→Permission→Scope) ومستخدمو اللوحة المنفصلون والإعدادات المركزية والإصدارات |
| D9 | الأمن والتدقيق والتسوية | audit_logs, security_events, risk_rules, risk_events, reconciliation_runs, reconciliation_items (6) | سجل التدقيق غير القابل للتعديل والأحداث الأمنية ومحرك المخاطر والمطابقة |

---

# 3. ERD العام

الرسم التالي يلخص المجموعات التسع والعلاقات المحورية (User→Wallet→Ledger، Transaction→Items→StatusHistory→LedgerEntries، Agent→Float/Settlement، Merchant→Branches→Terminals→QR، Region→Eligibility). أسماء الكيانات لاتينية داخل الرسم لأغراض المحاذاة، والعلاقات الدقيقة مرقّمة في الجدول بعده.

```
+====================================================================================+
|         SOUTH WALLET - GLOBAL ERD   (9 DOMAINS / 78 TABLES / PostgreSQL 15+)        |
|         amounts: NUMERIC(18,4) + currency CHAR(3)   |   money rows: APPEND-ONLY    |
+====================================================================================+

 [D1 IDENTITY & ACCOUNT]                 [D2 GEOGRAPHY & ELIGIBILITY]
 +-----------------------------------+   +-----------------------------------+
 | users (phone UQ)                  |   | regions (code UQ)                 |
 |   |1:1  profiles                   |   |   |1:N  districts                   |
 |   |1:N  devices --1:N sessions     |N:1| region_id                          |
 |   |1:N  otp_codes                  |-->|   |1:N  eligibility_policies       |
 |   |1:N  push_tokens                |   |   | (region|district, priority)     |
 |   |1:N  favorites ----> users      |   +-----------------------------------+
 |   |1:1  kyc_profiles               |
 |   |        |1:N  kyc_documents     |
 |   |1:N  idempotency_keys           |
 +-----------------------------------+

 [D3 CORE FINANCE - Wallet + Ledger]
 +------------------------------------------------------------------------------+
 | currencies --1:N-- wallets (UQ user+currency) --1:1-- wallet_balances       |
 |     |                 | 1:1                                     (available/   |
 |     |                 v                                          pending/     |
 | exchange_rates   ledger_accounts (chart of accounts)              frozen)      |
 | (FX snapshot)      types: USER_WALLET / SAVINGS / FEE_REVENUE /              |
 |                     AGENT_FLOAT / AGENT_COMMISSION / MERCHANT_SETTLEMENT /   |
 |                     PROVIDER_SUSPENSE / TREASURY / FX_MARGIN / SYSTEM        |
 |     ledger_accounts --1:N-- ledger_entries (DEBIT/CREDIT, monthly parts)     |
 |                     [SUM(debit) = SUM(credit) per transaction  ->  P-02]     |
 +------------------------------------------------------------------------------+

 [D4 TRANSACTIONS & ORDERS]   (transactions + ledger_entries: monthly partitions)
 +------------------------------------------------------------------------------+
 | fee_rules / limit_rules ---snapshot(id+version+amount)---> transactions      |
 | idempotency_keys (UQ key+endpoint) ---> transactions (same key = same result)|
 | transactions (PK: id + tx_date, reference: SW-YYYYMMDD-XXXXXXXX)             |
 |   |--1:N-- transaction_items (legs: PRINCIPAL/FEE/AGENT_COMMISSION/MARGIN)  |
 |   |--1:N-- transaction_status_history (every transition logged)             |
 |   |--1:1-- transaction_references (global ref UQ + reversal_of link)        |
 |   |--1:1-- deposit_requests / withdrawal_requests / payments /              |
 |   |          topups(D6) / bill_payments(D6) / savings_transactions(D6)      |
 |   |--1:1-- remittance_orders ---1:N--- remittance_deliveries                |
 |   +--1:1-- adjustment_requests (Maker-Checker -> executed tx)               |
 | provider_webhook_events (idempotent provider ingestion)                     |
 +------------------------------------------------------------------------------+

 [D5 NETWORKS, AGENTS & MERCHANTS]
 +------------------------------------------------------------------------------+
 | users --1:1-- agents --1:N-- agent_float_accounts --1:1-- ledger_accounts   |
 |                 |   |          (per currency, type AGENT_FLOAT)             |
 |                 |   |--1:N-- agent_commission_rules / agent_daily_settlem.  |
 | users --1:1-- merchants --1:N-- merchant_branches --1:N-- terminals         |
 |                                    |                     |1:N  qr_codes     |
 |                                    |--1:N-- merchant_settlements            |
 | networks --1:N-- network_products (--> D6: topups / network_cards)          |
 +------------------------------------------------------------------------------+

 [D6 SERVICES - Topup / Bills / Cards / Savings / Crypto]
 +------------------------------------------------------------------------------+
 | services (registry: ON/OFF/MAINTENANCE per service)                         |
 | network_products --1:N-- topups --N:1-- transactions                        |
 | network_products --1:N-- network_cards --1:1-- network_card_sales --N:1 tx  |
 | bill_providers --1:N-- bill_products --1:N-- bill_payments --N:1-- tx       |
 | users --1:N-- savings_accounts --1:1-- ledger_accounts (SAVINGS)            |
 |                         |1:N-- savings_transactions --N:1-- transactions    |
 | digital_assets --1:N-- crypto_addresses --1:N-- crypto_transactions         |
 | blockchain_networks --1:N-- crypto_addresses  (asset x network)             |
 +------------------------------------------------------------------------------+

 [D7 SUPPORT & CONTENT]
 +------------------------------------------------------------------------------+
 | users --1:N-- notifications --N:1-- notification_templates (i18n)           |
 | users --1:N-- support_tickets --1:N-- support_messages                      |
 | support_tickets --N:1-- transactions (problem report from tx screen)        |
 | content / banners / faqs  (soft delete: deleted_at)                         |
 +------------------------------------------------------------------------------+

 [D8 ADMIN & RBAC]
 +------------------------------------------------------------------------------+
 | roles --1:N-- admin_users --1:N-- admin_sessions (MFA mandatory)            |
 | roles --M:N-- permissions via role_permissions (scope: GLOBAL/REGION/ENTITY)|
 | feature_flags / system_settings / system_state / app_versions               |
 +------------------------------------------------------------------------------+

 [D9 SECURITY, AUDIT & RECONCILIATION]
 +------------------------------------------------------------------------------+
 | audit_logs (append-only: actor/action/target/before/after/reason/ip)        |
 | security_events --N:1-- users / devices                                     |
 | risk_rules --1:N-- risk_events --N:1-- transactions / users                 |
 | reconciliation_runs --1:N-- reconciliation_items                            |
 |   (ledger totals vs wallet balances -> VARIANCE -> Adjustment, never DELETE)|
 +------------------------------------------------------------------------------+
```

## 3.1 جدول العلاقات (مرقّم)

سلوك الحذف موحّد: **ON DELETE RESTRICT** لكل العلاقات (P-11) — لا حذف متسلسل لأي بيانات مالية أو مرجعية.

| # | من | إلى | النوع | الحقل الرابط |
|---|---|---|---|---|
| 1 | users | profiles | 1-1 | profiles.user_id (UQ) |
| 2 | users | devices | 1-N | devices.user_id |
| 3 | devices | sessions | 1-N | sessions.device_id |
| 4 | users | sessions | 1-N | sessions.user_id |
| 5 | users | otp_codes | 1-N | otp_codes.phone (منطقي) |
| 6 | users | push_tokens | 1-N | push_tokens.user_id |
| 7 | users | favorites (كمالك) | 1-N | favorites.user_id |
| 8 | users | favorites (كطرف مفضل) | 1-N | favorites.favorite_user_id |
| 9 | users | kyc_profiles | 1-1 | kyc_profiles.user_id (UQ) |
| 10 | kyc_profiles | kyc_documents | 1-N | kyc_documents.kyc_profile_id |
| 11 | users | idempotency_keys | 1-N | idempotency_keys.user_id |
| 12 | regions | districts | 1-N | districts.region_id |
| 13 | regions | eligibility_policies | 1-N | eligibility_policies.region_id |
| 14 | districts | eligibility_policies | 1-N | eligibility_policies.district_id |
| 15 | regions | users | N-1 | users.region_id (§5.10) |
| 16 | currencies | wallets | 1-N | wallets.currency_code |
| 17 | users | wallets | 1-N | wallets.user_id (UQ مع العملة) |
| 18 | wallets | wallet_balances | 1-1 | wallet_balances.wallet_id (UQ) |
| 19 | wallets | ledger_accounts | 1-1 | wallets.ledger_account_id (UQ، نوع USER_WALLET) |
| 20 | users | ledger_accounts | 1-N | ledger_accounts.owner_user_id |
| 21 | agents | ledger_accounts | 1-N | ledger_accounts.owner_agent_id (§5.10) |
| 22 | merchants | ledger_accounts | 1-N | ledger_accounts.owner_merchant_id (§5.10) |
| 23 | ledger_accounts | ledger_entries | 1-N | ledger_entries.account_id |
| 24 | transactions | ledger_entries | 1-N | ledger_entries.(transaction_id, tx_date) (§5.10) |
| 25 | currencies | exchange_rates | 1-N | exchange_rates.(base_currency, quote_currency) |
| 26 | fee_rules | transactions | 1-N | transactions.(fee_rule_id, fee_rule_version) لقطة |
| 27 | exchange_rates | transactions | 1-N | transactions.(exchange_rate_id, exchange_rate_value) لقطة |
| 28 | idempotency_keys | transactions | 1-1 | transactions.idempotency_key_id |
| 29 | users | transactions (بادئ) | 1-N | transactions.user_id |
| 30 | users | transactions (طرف مقابل) | 1-N | transactions.counterparty_user_id |
| 31 | wallets | transactions (مصدر) | 1-N | transactions.source_wallet_id |
| 32 | wallets | transactions (مستقبل) | 1-N | transactions.destination_wallet_id |
| 33 | transactions | transaction_references | 1-1 | transaction_references.(transaction_id, tx_date) |
| 34 | transactions | transaction_items | 1-N | transaction_items.(transaction_id, tx_date) |
| 35 | ledger_accounts | transaction_items | 1-N | transaction_items.account_id |
| 36 | transactions | transaction_status_history | 1-N | transaction_status_history.(transaction_id, tx_date) |
| 37 | transactions | deposit_requests | 1-1 | deposit_requests.(transaction_id, tx_date) |
| 38 | users | deposit_requests | 1-N | deposit_requests.user_id |
| 39 | agents | deposit_requests | 1-N | deposit_requests.agent_id (§5.10) |
| 40 | transactions | withdrawal_requests | 1-1 | withdrawal_requests.(transaction_id, tx_date) |
| 41 | users / agents | withdrawal_requests | 1-N | withdrawal_requests.(user_id, agent_id) |
| 42 | agents | withdrawal_requests | 1-N | withdrawal_requests.agent_id (§5.10) |
| 43 | transactions | payments | 1-1 | payments.(transaction_id, tx_date) |
| 44 | users | payments (دافع) | 1-N | payments.payer_user_id |
| 45 | merchants | payments | 1-N | payments.merchant_id (§5.10) |
| 46 | merchant_branches | payments | 1-N | payments.branch_id (§5.10) |
| 47 | terminals | payments | 1-N | payments.terminal_id (§5.10) |
| 48 | qr_codes | payments | 1-N | payments.qr_code_id (§5.10) |
| 49 | transactions | remittance_orders | 1-1 | remittance_orders.(transaction_id, tx_date) |
| 50 | agents | remittance_orders | 1-N | remittance_orders.agent_id (§5.10) |
| 51 | remittance_orders | remittance_deliveries | 1-N | remittance_deliveries.remittance_order_id |
| 52 | agents | remittance_deliveries | 1-N | remittance_deliveries.agent_id (§5.10) |
| 53 | ledger_accounts | adjustment_requests | 1-N | adjustment_requests.target_account_id |
| 54 | admin_users | adjustment_requests (Maker/Checker) | 1-N | adjustment_requests.(requested_by, approved_by) (§5.10) |
| 55 | transactions | adjustment_requests (منفَّذة) | 1-1 | adjustment_requests.(transaction_id, tx_date) |
| 56 | users | agents | 1-1 | agents.user_id (UQ) |
| 57 | agents | agent_float_accounts | 1-N | agent_float_accounts.agent_id (لكل عملة) |
| 58 | ledger_accounts | agent_float_accounts | 1-1 | agent_float_accounts.ledger_account_id (UQ، نوع AGENT_FLOAT) |
| 59 | agents | agent_commission_rules | 1-N | agent_commission_rules.agent_id |
| 60 | agents | agent_daily_settlements | 1-N | agent_daily_settlements.agent_id |
| 61 | users | merchants | 1-1 | merchants.user_id (UQ) |
| 62 | merchants | merchant_branches | 1-N | merchant_branches.merchant_id |
| 63 | merchant_branches | terminals | 1-N | terminals.branch_id |
| 64 | terminals | qr_codes | 1-N | qr_codes.terminal_id |
| 65 | merchants | merchant_settlements | 1-N | merchant_settlements.merchant_id |
| 66 | networks | network_products | 1-N | network_products.network_id |
| 67 | network_products | topups | 1-N | topups.network_product_id |
| 68 | transactions | topups | 1-1 | topups.(transaction_id, tx_date) |
| 69 | network_products | network_cards | 1-N | network_cards.product_id |
| 70 | network_cards | network_card_sales | 1-1 | network_card_sales.network_card_id (UQ) |
| 71 | transactions | network_card_sales | 1-1 | network_card_sales.(transaction_id, tx_date) |
| 72 | bill_providers | bill_products | 1-N | bill_products.provider_id |
| 73 | bill_products | bill_payments | 1-N | bill_payments.bill_product_id |
| 74 | transactions | bill_payments | 1-1 | bill_payments.(transaction_id, tx_date) |
| 75 | users | savings_accounts | 1-N | savings_accounts.user_id |
| 76 | ledger_accounts | savings_accounts | 1-1 | savings_accounts.ledger_account_id (UQ، نوع SAVINGS) |
| 77 | savings_accounts | savings_transactions | 1-N | savings_transactions.savings_account_id |
| 78 | transactions | savings_transactions | 1-1 | savings_transactions.(transaction_id, tx_date) |
| 79 | digital_assets | crypto_addresses | 1-N | crypto_addresses.asset_id |
| 80 | blockchain_networks | crypto_addresses | 1-N | crypto_addresses.network_id |
| 81 | crypto_addresses | crypto_transactions | 1-N | crypto_transactions.address_id |
| 82 | users | notifications | 1-N | notifications.user_id |
| 83 | notification_templates | notifications | 1-N | notifications.template_id |
| 84 | users | support_tickets | 1-N | support_tickets.user_id |
| 85 | transactions | support_tickets | 1-N | support_tickets.(transaction_id, tx_date) |
| 86 | support_tickets | support_messages | 1-N | support_messages.ticket_id |
| 87 | admin_users | support_tickets (المسؤول) | 1-N | support_tickets.assigned_admin_id (§5.10) |
| 88 | roles | admin_users | 1-N | admin_users.role_id |
| 89 | roles | permissions | M-N | role_permissions.(role_id, permission_id, scope) |
| 90 | admin_users | admin_sessions | 1-N | admin_sessions.admin_user_id |
| 91 | users | security_events | 1-N | security_events.user_id |
| 92 | devices | security_events | 1-N | security_events.device_id |
| 93 | risk_rules | risk_events | 1-N | risk_events.rule_id |
| 94 | transactions | risk_events | 1-N | risk_events.(transaction_id, tx_date) |
| 95 | reconciliation_runs | reconciliation_items | 1-N | reconciliation_items.run_id |
| 96 | ledger_accounts / wallets | reconciliation_items | 1-N | reconciliation_items.(account_id, wallet_id) |
| 97 | adjustment_requests | reconciliation_items | 1-N | reconciliation_items.adjustment_request_id |
| 98 | admin_users | kyc_profiles (المدقق) | 1-N | kyc_profiles.reviewed_by (§5.10) |

---

# 4. الأنواع (ENUMs)

كل آلة حالة في ملحق أ من SRS أصبحت نوع ENUM، إضافة إلى أنواع تصنيفية يفرضها المخطط. كل الأنواع تُنشأ قبل الجداول (ترتيب Migrations):

```sql
-- أنواع الهوية والحساب
CREATE TYPE user_type AS ENUM ('CUSTOMER','AGENT','MERCHANT');                       -- نوع مستخدم التطبيق (2.3.1)
CREATE TYPE account_status AS ENUM ('PENDING','ACTIVE','RESTRICTED','FROZEN','SUSPENDED','CLOSED');  -- آلة حالة الحساب (ملحق أ)
CREATE TYPE kyc_status AS ENUM ('NOT_STARTED','PENDING','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED','REQUIRES_UPDATE');  -- آلة حالة KYC
CREATE TYPE device_status AS ENUM ('PENDING','TRUSTED','UNTRUSTED','BLOCKED');       -- حالة ثقة الجهاز (Master §10)
CREATE TYPE eligibility_status AS ENUM ('ELIGIBLE','PENDING_REVIEW','RESTRICTED','OUTSIDE_SERVICE_AREA','BLOCKED');  -- نتيجة تقييم الأهلية (FR-GEO-012)
CREATE TYPE record_status AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');                  -- الحالة القياسية للكيانات الإدارية (Master §89)
CREATE TYPE otp_purpose AS ENUM ('REGISTRATION','LOGIN','PIN_RESET','PHONE_CHANGE','DEVICE_TRUST','TX_2FA','SUPPORT');  -- غرض رمز OTP

-- أنواع المحاسبة والمال
CREATE TYPE ledger_account_type AS ENUM ('USER_WALLET','SAVINGS','FEE_REVENUE','AGENT_FLOAT','AGENT_COMMISSION','MERCHANT_SETTLEMENT','PROVIDER_SUSPENSE','TREASURY','FX_MARGIN','SYSTEM');  -- دليل الحسابات (Master §14)
CREATE TYPE ledger_entry_type AS ENUM ('DEBIT','CREDIT');                            -- جانب القيد (Double-Entry)
CREATE TYPE transaction_type AS ENUM ('TRANSFER','FX_EXCHANGE','REMITTANCE','REMITTANCE_INBOUND','DEPOSIT','WITHDRAWAL','MERCHANT_PAYMENT','TOPUP','BILL_PAYMENT','NETWORK_CARD_PURCHASE','SAVINGS_DEPOSIT','SAVINGS_WITHDRAWAL','FLOAT_TOPUP','FLOAT_WITHDRAW','ADJUSTMENT','REVERSAL');  -- نوع العملية المالية
CREATE TYPE transaction_item_type AS ENUM ('PRINCIPAL','FEE','AGENT_COMMISSION','FX_MARGIN','HOLD','RELEASE','ADJUSTMENT');  -- بنود المعاملة (ساق محاسبية)
CREATE TYPE fee_calc_type AS ENUM ('FIXED','PERCENTAGE','MIXED');                    -- طريقة حساب الرسوم (Master §36)
CREATE TYPE limit_period AS ENUM ('PER_TRANSACTION','DAILY','WEEKLY','MONTHLY','BALANCE');  -- مدة الحد (Master §38)

-- آلات حالات العمليات (ملحق أ)
CREATE TYPE transaction_status AS ENUM ('CREATED','VALIDATING','AUTHORIZED','PROCESSING','COMPLETED','FAILED','REJECTED','CANCELLED','EXPIRED','REVERSED','UNDER_REVIEW');  -- آلة حالة المعاملة
CREATE TYPE withdrawal_status AS ENUM ('CREATED','PENDING','AUTHORIZED','READY_FOR_COLLECTION','COLLECTED','COMPLETED','REJECTED','EXPIRED','CANCELLED','REVERSED');  -- آلة حالة السحب
CREATE TYPE deposit_request_status AS ENUM ('CREATED','PENDING','CONFIRMED','COMPLETED','REJECTED','EXPIRED','CANCELLED');  -- آلة حالة طلب الإيداع (Master §21)
CREATE TYPE remittance_status AS ENUM ('CREATED','PENDING_DELIVERY','DELIVERED','COMPLETED','EXPIRED','CANCELLED','REVERSED');  -- آلة حالة الحوالة
CREATE TYPE adjustment_status AS ENUM ('PENDING','APPROVED','REJECTED','EXECUTED','CANCELLED');  -- دورة حياة التعديل المالي (Master §43)
CREATE TYPE webhook_status AS ENUM ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED');  -- حالة حدث مزود (Master §68/69)

-- الوكلاء والتجار والشبكات
CREATE TYPE agent_status AS ENUM ('ACTIVE','SUSPENDED','BLOCKED');                   -- آلة حالة الوكيل (Master §99)
CREATE TYPE merchant_status AS ENUM ('PENDING','ACTIVE','SUSPENDED','BLOCKED','CLOSED');  -- حالة التاجر
CREATE TYPE settlement_status AS ENUM ('PENDING','BALANCED','VARIANCE','SETTLED','PAID','ADJUSTED','CANCELLED');  -- حالة التسوية (وكيل/تاجر)
CREATE TYPE qr_type AS ENUM ('STATIC','DYNAMIC');                                    -- نوع QR (Master §26)
CREATE TYPE qr_status AS ENUM ('ACTIVE','EXPIRED','REVOKED');                        -- حالة QR
CREATE TYPE payment_method AS ENUM ('QR_SCAN','POSCOF','PAY_REQUEST');               -- طريقة الدفع للتاجر (FR-PAY)
CREATE TYPE network_card_status AS ENUM ('IN_STOCK','RESERVED','SOLD','DISABLED');   -- دورة حياة كرت الشبكة (Master §32)

-- الخدمات
CREATE TYPE service_status AS ENUM ('ON','OFF','MAINTENANCE');                       -- حالة الخدمة (Master §49, FR-ADM-037)
CREATE TYPE system_status AS ENUM ('ACTIVE','MAINTENANCE','READ_ONLY','SERVICE_DEGRADED','BLOCKED');  -- حالة النظام (Master §51)
CREATE TYPE savings_status AS ENUM ('ACTIVE','COMPLETED','CANCELLED');               -- حالة هدف الحصالة
CREATE TYPE savings_tx_type AS ENUM ('DEPOSIT','WITHDRAWAL');                        -- نوع عملية الحصالة
CREATE TYPE crypto_direction AS ENUM ('DEPOSIT','WITHDRAWAL');                       -- اتجاه حركة أصل رقمي (مؤجل)
CREATE TYPE crypto_tx_status AS ENUM ('PENDING','CONFIRMED','FAILED');               -- حالة حركة البلوكشين (مؤجل)

-- الإشعارات والدعم والمحتوى
CREATE TYPE notification_type AS ENUM ('TRANSACTION','SECURITY','KYC','SYSTEM','MARKETING','SUPPORT');  -- أنواع الإشعارات (Master §54)
CREATE TYPE notification_channel AS ENUM ('IN_APP','PUSH','SMS');                    -- قناة الإشعار
CREATE TYPE ticket_status AS ENUM ('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED');  -- آلة حالة التذكرة (Master §56)
CREATE TYPE ticket_priority AS ENUM ('LOW','MEDIUM','HIGH','URGENT');                -- أولوية التذكرة
CREATE TYPE message_sender_type AS ENUM ('USER','ADMIN','SYSTEM');                   -- مرسل رسالة التذكرة
CREATE TYPE content_type AS ENUM ('TERMS','PRIVACY','ARTICLE','HELP_ARTICLE','SERVICE_DESCRIPTION','HOME_SECTION','ANNOUNCEMENT');  -- أنواع المحتوى (Master §53)

-- الإدارة والأمن والتسوية
CREATE TYPE platform_type AS ENUM ('ANDROID','IOS','WEB');                           -- منصة الجهاز/التطبيق
CREATE TYPE scope_type AS ENUM ('GLOBAL','REGION','ENTITY');                         -- مدى الصلاحية (Master §47)
CREATE TYPE actor_type AS ENUM ('USER','ADMIN','SYSTEM','JOB');                      -- نوع الفاعل في التاريخ والتدقيق
CREATE TYPE risk_decision AS ENUM ('ALLOW','REVIEW','BLOCK');                        -- قرار محرك المخاطر (Master §62)
CREATE TYPE risk_effect AS ENUM ('NONE','ALERT','REVIEW','FREEZE');                  -- أثر قاعدة المخاطر (Master §63)
CREATE TYPE reconciliation_status AS ENUM ('RUNNING','COMPLETED','FAILED');          -- حالة تشغيلة المطابقة
CREATE TYPE reconciliation_result AS ENUM ('MATCHED','VARIANCE');                    -- نتيجة بند المطابقة (Master §44/76)
```

---

# 5. جداول كل مجموعة بالتفصيل

اصطلاحات موحدة قبل البدء:

- **PK:** `id UUID DEFAULT gen_random_uuid()` لكل جدول، ما لم يُذكر خلاف ذلك (جداول الأقسام الشهرية والسجلات المتسلسلة تستخدم `BIGINT IDENTITY` مع مفتاح مركب).
- **الأعمدة القياسية** (Master §89): كل كيان إداري يحمل `created_at, updated_at, created_by, updated_by, status` — وبما أن `created_by/updated_by` قد يكون مستخدماً أو إدارياً أو Job، فهي **مراجع فاعل (Actor References)** بلا FK صلب، ويُحفظ الفاعل الحقيقي في `audit_logs` (القرار M-14).
- **التقسيم الشهري:** الجدولان `transactions` و`ledger_entries` مُقسّمان بـ `RANGE(tx_date)`، لذلك مفتاحهما `(id, tx_date)` وكل جدول يرتبط بهما يحمل العمودين معاً بـ FK مركب (القرار M-02).
- **الترتيب في الوثيقة عرضي (منطقي)؛** ترتيب الإنشاء الفعلي يحدده Migrations، والقيود المرجعية «الأمامية» بين المجموعات مجموعة في §5.10 عبر `ALTER TABLE` لتتوافق مع ترتيب إنشاء حقيقي.
- **كل FK مسمّى** (`fk_*`) وكل قيد فريد (`uq_*`) وكل CHECK (`ck_*`)، والكل بـ `ON DELETE RESTRICT`.
- التوقيت `TIMESTAMPTZ`، والمبالغ `NUMERIC(18,4)`، والعملات `CHAR(3)`.

## 5.1 المجموعة الأولى — الهوية والحساب

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| users | حساب مستخدم التطبيق (عميل/وكيل/تاجر) | ← regions؛ → profiles/devices/sessions/wallets/transactions |
| profiles | البيانات الشخصية 1-1 | → users |
| otp_codes | رموز التحقق لمرة واحدة (هاش) | بالهاتف |
| devices | أجهزة المستخدم وبصماتها | → users؛ → sessions |
| sessions | جلسات قابلة للإبطال المركزي | → users, devices |
| push_tokens | رموز FCM لكل جهاز | → users, devices |
| favorites | المفضلون للتحويل السريع | → users (طرفان) |
| kyc_profiles | ملف التوثيق ومستواه | → users؛ → admin_users (المدقق) |
| kyc_documents | مستندات KYC (Metadata فقط) | → kyc_profiles |
| idempotency_keys | تماثل الطلبات الحساسة | → users؛ → transactions |

### users
حساب مستخدم التطبيق — رقم الهاتف هو المفتاح الطبيعي الوحيد (رقم واحد = حساب واحد، FR-GEO-011)، وحالة الحساب آلة ENUM كاملة.

```sql
-- users: حساب المستخدم النهائي (عميل/وكيل/تاجر) — هاتف موحّد وحالة حساب قياسية (Master §5/§6)
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               VARCHAR(16) NOT NULL,
  user_type           user_type NOT NULL DEFAULT 'CUSTOMER',
  account_status      account_status NOT NULL DEFAULT 'PENDING',
  eligibility_status  eligibility_status NOT NULL DEFAULT 'PENDING_REVIEW',  -- محسوبة من المحرك (FR-GEO-004)
  pin_hash            VARCHAR(255),                        -- argon2/bcrypt فقط، لا نص صريح (FR-AUTH-015)
  region_id           UUID NOT NULL,                       -- FK → regions (§5.10)
  district_id         UUID,                                -- FK → districts (§5.10)
  failed_pin_attempts SMALLINT NOT NULL DEFAULT 0,         -- FR-AUTH-017
  pin_locked_until    TIMESTAMPTZ,
  locale              VARCHAR(5) NOT NULL DEFAULT 'ar',
  terms_accepted_at   TIMESTAMPTZ,                         -- FR-AUTH-006
  closed_at           TIMESTAMPTZ,                         -- FR-ACC-004
  anonymized_at       TIMESTAMPTZ,                         -- §91: إخفاء البيانات الشخصية بعد الإغلاق
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID, updated_by UUID,
  CONSTRAINT uq_users_phone UNIQUE (phone),
  CONSTRAINT ck_users_phone CHECK (phone ~ '^[0-9]{9,15}$'),
  CONSTRAINT ck_users_locale CHECK (locale IN ('ar','en'))
);
CREATE INDEX idx_users_type_status ON users (user_type, account_status);
CREATE INDEX idx_users_region ON users (region_id, account_status);
```

### profiles
البيانات الشخصية لكل مستخدم (1-1) — تُخفى/تُفرَّغ جزئياً عند إغلاق الحساب وفق سياسة §91.

```sql
-- profiles: البيانات الشخصية (الاسم/الصورة/العنوان) — 1:1 مع users (Master §5)
CREATE TABLE profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  full_name    VARCHAR(120) NOT NULL,
  avatar_url   VARCHAR(500),
  address_text VARCHAR(300),
  date_of_birth DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID, updated_by UUID,
  CONSTRAINT uq_profiles_user UNIQUE (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

### otp_codes
رموز التحقق لمرة واحدة — تُخزَّن هاشاً فقط وتنتهي صلاحيتها وتُقفل بعد المحاولات (FR-AUTH-001/002).

```sql
-- otp_codes: رموز OTP بخاصية الاستهلاك الواحد — code_hash فقط لا نص صريح (FR-AUTH)
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(16) NOT NULL,
  purpose     otp_purpose NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,      -- حد 5 محاولات ثم قفل مؤقت (FR-AUTH-001)
  consumed_at TIMESTAMPTZ,
  request_ip  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone_created ON otp_codes (phone, purpose, created_at DESC);
```

### devices
سجل أجهزة كل مستخدم — بصمة فريدة لكل (مستخدم×جهاز) وحالة ثقة/حظر وإشارات مخاطر (Master §10، FR-GEO-010).

```sql
-- devices: أجهزة المستخدم — بصمة الجهاز + حالة الثقة + إشارات الخطر (root/محاكي/mock-location)
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  fingerprint   VARCHAR(128) NOT NULL,
  platform      platform_type NOT NULL,
  device_name   VARCHAR(120),
  app_version   VARCHAR(20),
  device_status device_status NOT NULL DEFAULT 'PENDING',
  risk_signals  JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_devices_user_fp UNIQUE (user_id, fingerprint),
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

### sessions
جلسات المستخدمين مع انتهاء صلاحية وإبطال مركزي — حسب البنية في Master §64.

```sql
-- sessions: جلسة = مستخدم + جهاز + رموز قابلة للإبطال المركزي (Master §64, FR-AUTH-023)
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  device_id     UUID NOT NULL,
  refresh_hash  VARCHAR(255) NOT NULL,
  ip            INET,
  user_agent    VARCHAR(300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoked_reason VARCHAR(200),
  CONSTRAINT uq_sessions_refresh UNIQUE (refresh_hash),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sessions_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
);
CREATE INDEX idx_sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);
```

### push_tokens
رموز FCM لكل جهاز — قناة إبلاغ فقط، لا دليل نجاح عملية (R-13).

```sql
-- push_tokens: رموز الإرسال لكل جهاز — تُحدَّث وتُعطَّل دون أي أثر مالي (R-13)
CREATE TABLE push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  device_id  UUID NOT NULL,
  platform   platform_type NOT NULL,
  fcm_token  VARCHAR(255) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_push_tokens_token UNIQUE (fcm_token),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_push_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
);
```

### favorites
المفضلون للتحويل السريع — مرتبون بالأكثر استخداماً وحد أقصى بسياسة (FR-FAV).

```sql
-- favorites: قائمة المفضلين (اسم مستعار + عملة افتراضية + عدد الاستخدام) (FR-FAV)
CREATE TABLE favorites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  favorite_user_id UUID NOT NULL,
  alias_name       VARCHAR(80),
  default_currency CHAR(3),
  use_count        INTEGER NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID, updated_by UUID,
  CONSTRAINT uq_favorites UNIQUE (user_id, favorite_user_id),
  CONSTRAINT ck_fav_currency CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fav_target FOREIGN KEY (favorite_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_favorites_user ON favorites (user_id, last_used_at DESC);
```

### kyc_profiles
ملف التوثيق لكل مستخدم — المستوى والحالة وقرار المدقق وسبب الرفض (Master §40/§41).

```sql
-- kyc_profiles: مستوى KYC (0..2) + آلة الحالة + قرار المدقق وسببه (FR-KYC)
CREATE TABLE kyc_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  kyc_level        SMALLINT NOT NULL DEFAULT 0,
  status           kyc_status NOT NULL DEFAULT 'NOT_STARTED',
  submitted_at     TIMESTAMPTZ,
  reviewed_by      UUID,                  -- FK → admin_users (§5.10)
  reviewed_at      TIMESTAMPTZ,
  rejection_reason VARCHAR(300),          -- Master §41
  expires_at       TIMESTAMPTZ,           -- FR-KYC-010: انتهاء دوري
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID, updated_by UUID,
  CONSTRAINT uq_kyc_profiles_user UNIQUE (user_id),
  CONSTRAINT ck_kyc_level CHECK (kyc_level BETWEEN 0 AND 2),
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

### kyc_documents
مستندات التوثيق — **Metadata فقط في القاعدة**؛ الملف في Storage موقّع بـ Signed Access (Master §122، FR-KYC-006).

```sql
-- kyc_documents: مستندات KYC — storage_key خارجي + هاش الملف؛ لا تخزين ملفات داخل القاعدة
CREATE TABLE kyc_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_profile_id UUID NOT NULL,
  user_id        UUID NOT NULL,
  doc_type       VARCHAR(30) NOT NULL,
  storage_key    VARCHAR(300) NOT NULL,   -- مسار الكائن في Bucket خاص بصلاحيات موقّعة
  file_hash      CHAR(64),
  mime_type      VARCHAR(60),
  size_bytes     INTEGER,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_kycdoc_type CHECK (doc_type IN ('ID_FRONT','ID_BACK','SELFIE','ADDRESS_PROOF','OTHER')),
  CONSTRAINT fk_kycdoc_profile FOREIGN KEY (kyc_profile_id) REFERENCES kyc_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_kycdoc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_kycdocs_profile ON kyc_documents (kyc_profile_id);
```

### idempotency_keys
مفاتيح تماثل الطلبات — `UNIQUE(idem_key, endpoint)` يحفظ مرجع الاستجابة (Master §16/§103، AC-03).

```sql
-- idempotency_keys: نفس المفتاح على نفس المسار = نفس النتيجة دون تنفيذ مزدوج (P-04)
CREATE TABLE idempotency_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idem_key           VARCHAR(64) NOT NULL,
  endpoint           VARCHAR(100) NOT NULL,
  user_id            UUID NOT NULL,
  request_hash       CHAR(64),
  response_reference VARCHAR(30),       -- مرجع SW-… للمعاملة الناتجة (Master §73)
  response_status    SMALLINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_idem UNIQUE (idem_key, endpoint),
  CONSTRAINT fk_idem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_idem_user ON idempotency_keys (user_id, created_at DESC);
```

## 5.2 المجموعة الثانية — الجغرافيا والأهلية

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| regions | المحافظات الثماني + أي منطقة مستقبلاً | → users, districts, eligibility_policies |
| districts | المديريات لكل محافظة | → regions؛ → users/agents/merchants |
| eligibility_policies | سياسة الأهلية لكل منطقة/مديرية | → regions, districts |

### regions
الكيان الجغرافي الأعلى — إدارة مركزية بالكامل دون إصدار تطبيق جديد (FR-GEO-001/002).

```sql
-- regions: المحافظات (عدن/لحج/أبين/شبوة/حضرموت/المهرة/سقطرى/الضالع) + تفعيل التسجيل والمعاملات
CREATE TABLE regions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 VARCHAR(8) NOT NULL,
  name                 VARCHAR(80) NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  registration_enabled BOOLEAN NOT NULL DEFAULT true,
  transaction_enabled  BOOLEAN NOT NULL DEFAULT true,
  notes                VARCHAR(300),
  status               record_status NOT NULL DEFAULT 'ACTIVE',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID, updated_by UUID,
  CONSTRAINT uq_regions_code UNIQUE (code)
);
```

### districts
المديريات التابعة للمحافظات — قابلة للإضافة/التعديل من لوحة التحكم (FR-GEO-001).

```sql
-- districts: المديريات — تُدار مركزياً وتدخل في أهلية التسجيل والعمليات
CREATE TABLE districts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id            UUID NOT NULL,
  code                 VARCHAR(12) NOT NULL,
  name                 VARCHAR(80) NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  registration_enabled BOOLEAN NOT NULL DEFAULT true,
  transaction_enabled  BOOLEAN NOT NULL DEFAULT true,
  notes                VARCHAR(300),
  status               record_status NOT NULL DEFAULT 'ACTIVE',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID, updated_by UUID,
  CONSTRAINT uq_districts_code UNIQUE (region_id, code),
  CONSTRAINT fk_districts_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT
);
```

### eligibility_policies
سياسات الأهلية — سياسة المديرية تتقدم على سياسة المحافظة (priority الأدنى أولاً)، وتقرر سلوك الخروج عن النطاق وسياسة VPN (FR-GEO-004/008/013).

```sql
-- eligibility_policies: قواعد الأهلية متعددة الإشارات لكل منطقة/مديرية مع نافذة سريان
CREATE TABLE eligibility_policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id            UUID NOT NULL,
  district_id          UUID,               -- NULL = سياسة على مستوى المحافظة
  priority             SMALLINT NOT NULL DEFAULT 100,
  login_allowed        BOOLEAN NOT NULL DEFAULT true,
  view_only            BOOLEAN NOT NULL DEFAULT false,   -- FR-GEO-013: دخول واطلاع فقط
  transactions_allowed BOOLEAN NOT NULL DEFAULT true,
  require_review       BOOLEAN NOT NULL DEFAULT false,
  min_kyc_level        SMALLINT NOT NULL DEFAULT 0,
  vpn_policy           risk_decision NOT NULL DEFAULT 'REVIEW',  -- FR-GEO-008
  effective_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to         TIMESTAMPTZ,
  status               record_status NOT NULL DEFAULT 'ACTIVE',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID, updated_by UUID,
  CONSTRAINT fk_ep_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ep_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT
);
CREATE INDEX idx_ep_lookup ON eligibility_policies (region_id, district_id, status);
```

## 5.3 المجموعة الثالثة — المالية الأساسية (Wallet + Ledger)

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| currencies | العملات المُدارة مع تفعيل لكل عملية | → wallets, exchange_rates |
| exchange_rates | أزواج FX الداخلية بسريان زمني | → currencies؛ لقطة داخل transactions |
| ledger_accounts | دليل الحسابات (محافظ/رسوم/Float/تسويات/Suspense/Treasury) | → ledger_entries, transaction_items |
| wallets | محفظة لكل (مستخدم × عملة) | → users, currencies, ledger_accounts |
| wallet_balances | available/pending/frozen مع قفل صف | → wallets |
| ledger_entries | قيود الدفتر Append-only (تقسيم شهري) | → ledger_accounts, transactions |

### currencies
العملات كيان مُدار مركزياً مع تفعيل مستقل لكل نوع عملية (Master §13، FR-WLT-003).

```sql
-- currencies: YER/SAR/USD — code ISO CHAR(3) مع decimals وتفعيل إيداع/سحب/تحويل
CREATE TABLE currencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                CHAR(3) NOT NULL,
  name                VARCHAR(60) NOT NULL,
  symbol              VARCHAR(8) NOT NULL,
  decimals            SMALLINT NOT NULL DEFAULT 2,
  is_display_currency BOOLEAN NOT NULL DEFAULT false,   -- FR-WLT-007: عملة العرض المكافئ
  deposit_enabled     BOOLEAN NOT NULL DEFAULT true,
  withdrawal_enabled  BOOLEAN NOT NULL DEFAULT true,
  transfer_enabled    BOOLEAN NOT NULL DEFAULT true,
  status              record_status NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID, updated_by UUID,
  CONSTRAINT uq_currencies_code UNIQUE (code),
  CONSTRAINT ck_currencies_code CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_currencies_decimals CHECK (decimals BETWEEN 0 AND 4)
);
```

### exchange_rates
أسعار الصرف الداخلية — تُدار من الإدارة وتُثبَّت قيمتها لحظة التنفيذ داخل المعاملة (FR-WLT-005/006، FR-ADM-027).

```sql
-- exchange_rates: زوج (base→quote) بسعر شراء/بيع وهامش ونافذة سريان — تاريخ كامل للأسعار
CREATE TABLE exchange_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency  CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  buy_rate       NUMERIC(21,8) NOT NULL,
  sell_rate      NUMERIC(21,8) NOT NULL,
  margin_pct     NUMERIC(6,4) NOT NULL DEFAULT 0,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to   TIMESTAMPTZ,
  status         record_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT uq_fx UNIQUE (base_currency, quote_currency, effective_from),
  CONSTRAINT ck_fx_pair CHECK (base_currency <> quote_currency),
  CONSTRAINT ck_fx_positive CHECK (buy_rate > 0 AND sell_rate > 0)
);
CREATE INDEX idx_fx_active ON exchange_rates (base_currency, quote_currency, effective_from DESC);
```

### ledger_accounts
دليل الحسابات المحاسبي — كل رصيد مالي في المنظومة (محافظ المستخدمين، الحصالة، الرسوم، Float الوكلاء، عمولاتهم، تسوية التجار، Suspense المزودين، Treasury، هامش FX، النظام) له حساب هنا (Master §14، FR-ADM-031).

```sql
-- ledger_accounts: دليل الحسابات — كل حركة مالية تمر عبر حساب هنا (Double-Entry)
CREATE TABLE ledger_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code      VARCHAR(24) NOT NULL,        -- ترميز محاسبي بشجرة حسابات
  account_type      ledger_account_type NOT NULL,
  name              VARCHAR(120) NOT NULL,
  currency_code     CHAR(3),                     -- NULL = حساب رأسمالي متعدد العملات
  owner_user_id     UUID,                        -- محافظ/حصالة المستخدمين
  owner_agent_id    UUID,                        -- FK → agents (§5.10): Float/عمولات
  owner_merchant_id UUID,                        -- FK → merchants (§5.10): تسوية التاجر
  status            record_status NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_ledger_accounts_code UNIQUE (account_code),
  CONSTRAINT ck_lacc_currency CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_lacc_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_lacc_type ON ledger_accounts (account_type, status);
CREATE INDEX idx_lacc_user ON ledger_accounts (owner_user_id) WHERE owner_user_id IS NOT NULL;
```

### wallets
محفظة واحدة لكل (مستخدم × عملة) — تُنشأ تلقائياً عند التسجيل للعملات المفعلة، ومرتبطة 1-1 بحساب `USER_WALLET` في الدليل (Master §11، FR-AUTH-007).

```sql
-- wallets: (user_id, currency_code) فريد — الرابط بين المستخدم ودليل الحسابات
CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  ledger_account_id UUID NOT NULL,       -- 1:1 مع حساب USER_WALLET
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  status            record_status NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_wallets_user_currency UNIQUE (user_id, currency_code),
  CONSTRAINT uq_wallets_ledger UNIQUE (ledger_account_id),
  CONSTRAINT ck_wallets_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wallets_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT
);
```

### wallet_balances
الأرصدة الثلاثة `available/pending/frozen` لكل محفظة — **تُحدَّث حصراً داخل معاملة قاعدة البيانات** مع `SELECT ... FOR UPDATE` على الصف، والرصيد المعروض يأتي من الخادم فقط (Master §12، FR-WLT-002/008).

```sql
-- wallet_balances: الرصيد المنطقي (available+pending+frozen) — يطابقه Reconciliation مع الدفتر
CREATE TABLE wallet_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL,
  currency_code CHAR(3) NOT NULL,
  available     NUMERIC(18,4) NOT NULL DEFAULT 0,
  pending       NUMERIC(18,4) NOT NULL DEFAULT 0,
  frozen        NUMERIC(18,4) NOT NULL DEFAULT 0,    -- Hold للعمليات المعلقة (FR-WLT-008)
  version       BIGINT NOT NULL DEFAULT 0,           -- قفل تفاؤلي/تسلسل التحديث
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_balances UNIQUE (wallet_id, currency_code),
  CONSTRAINT ck_wb_amounts CHECK (available >= 0 AND pending >= 0 AND frozen >= 0),
  CONSTRAINT ck_wb_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_wb_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT
);
```

### ledger_entries
قلب المنظومة المالي — **Append-only** وكل قيد ينتمي لمعاملة ولحساب؛ لكل معاملة قيدان أو أكثر ومجموع المدين = الدائن (يُفرض بالتطبيق ويُفحص بـ Reconciliation دوري — Master §14/§76). مقسّم شهرياً بـ `RANGE(tx_date)`.

```sql
-- ledger_entries: قيود الدفتر (DEBIT/CREDIT) — لا تعديل ولا حذف أبداً (P-05, Master §75)
CREATE TABLE ledger_entries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY,
  tx_date         DATE NOT NULL DEFAULT CURRENT_DATE,    -- مفتاح القسم الشهري
  transaction_id  UUID NOT NULL,                          -- FK مركب → transactions (§5.10)
  account_id      UUID NOT NULL,
  entry_type      ledger_entry_type NOT NULL,
  amount          NUMERIC(18,4) NOT NULL,
  currency_code   CHAR(3) NOT NULL,
  running_balance NUMERIC(18,4),                          -- رصيد الحساب بعد القيد (كشف الحساب)
  memo            VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, tx_date),
  CONSTRAINT ck_le_amount CHECK (amount > 0),
  CONSTRAINT ck_le_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_le_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT
) PARTITION BY RANGE (tx_date);
CREATE INDEX idx_le_account_date ON ledger_entries (account_id, tx_date);
CREATE INDEX idx_le_transaction ON ledger_entries (transaction_id);
-- الأقسام الشهرية وقسم DEFAULT تُنشأ في §7.2
```

## 5.4 المجموعة الرابعة — المعاملات والطلبات

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| fee_rules | محرك الرسوم بكل الأبعاد + إصدارات | لقطة داخل transactions |
| limit_rules | محرك الحدود (عملية/يوم/أسبوع/شهر/رصيد) | قراءة قبل التنفيذ |
| transactions | السجل المركزي Append-only (تقسيم شهري) | ← users/wallets/fee_rules؛ → كل الطلبات والقيود |
| transaction_references | تفرد المرجع العالمي + ربط العكس بالأصل | → transactions |
| transaction_items | بنود المعاملة (أصل/رسوم/عمولة/هامش) | → transactions, ledger_accounts |
| transaction_status_history | كل انتقال حالة مع الفاعل والسبب | → transactions |
| deposit_requests | طلبات الإيداع عبر الوكلاء | → transactions, users, agents |
| withdrawal_requests | طلبات السحب مع Hold ورمز قبض | → transactions, users, agents |
| payments | مدفوعات التجار (QR/POSCOF/Pay Request) | → transactions, merchants, terminals, qr_codes |
| remittance_orders | الحوالات إلى غير المشتركين | → transactions, agents |
| remittance_deliveries | تسليم الحوالات لدى الوكيل | → remittance_orders, agents |
| adjustment_requests | التعديل المالي Maker-Checker | → ledger_accounts, admin_users, transactions |
| provider_webhook_events | استقبال أحداث المزودين idempotent | مستقل (provider_code) |

### fee_rules
محرك الرسوم المركزي — القاعدة بكل أبعادها (خدمة/عملة/مستوى KYC/منطقة/مدى مبلغ/ثابت-نسبة بحد أدنى وأقصى/سريان زمني) ولا رسوم مدفونة في التطبيق (Master §36، FR-LDG-011). المعاملة تحتفظ بلقطة `(fee_rule_id, fee_version, fee_amount)`.

```sql
-- fee_rules: قواعد الرسوم مركزية بإصدارات — الإدارة تعدل بالنسخ لا بالتعديل التاريخي (Master §37)
CREATE TABLE fee_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code   VARCHAR(40) NOT NULL,      -- transfer/withdrawal/payment/topup/bill/...
  currency_code  CHAR(3),
  kyc_level      SMALLINT,                   -- NULL = كل المستويات
  region_id      UUID,
  min_amount     NUMERIC(18,4),
  max_amount     NUMERIC(18,4),
  calc_type      fee_calc_type NOT NULL,
  fixed_fee      NUMERIC(18,4) NOT NULL DEFAULT 0,
  percentage_fee NUMERIC(6,4) NOT NULL DEFAULT 0,
  min_fee        NUMERIC(18,4) NOT NULL DEFAULT 0,
  max_fee        NUMERIC(18,4),
  version        INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to   TIMESTAMPTZ,
  status         record_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT uq_fee_rules_version UNIQUE (id, version),
  CONSTRAINT ck_fee_pct CHECK (percentage_fee >= 0),
  CONSTRAINT ck_fee_minmax CHECK (min_fee >= 0 AND (max_fee IS NULL OR max_fee >= min_fee))
);
CREATE INDEX idx_fee_rules_match ON fee_rules (service_code, currency_code, status, effective_from DESC);
```

### limit_rules
محرك الحدود المركزي — لكل (مستخدم/مستوى KYC/عملة/خدمة/منطقة/وكيل/تاجر) ولكل مدة، والفحص = الاستخدام الحالي + المطلوب ≤ الحد (Master §38، FR-LDG-012، FR-ADM-020/025).

```sql
-- limit_rules: الحدود per_transaction/daily/weekly/monthly/balance بكل الأبعاد
CREATE TABLE limit_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code   VARCHAR(40),
  currency_code  CHAR(3),
  kyc_level      SMALLINT,
  region_id      UUID,
  agent_id       UUID,                        -- حدود وكيل (FR-ADM-020)
  merchant_id    UUID,                        -- حدود دفع تاجر (FR-ADM-022)
  period_type    limit_period NOT NULL,
  max_amount     NUMERIC(18,4) NOT NULL,
  min_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to   TIMESTAMPTZ,
  status         record_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT ck_limit_amounts CHECK (max_amount > 0 AND min_amount >= 0 AND max_amount >= min_amount)
);
CREATE INDEX idx_limit_rules_match ON limit_rules (service_code, currency_code, kyc_level, status);
```

### transactions
السجل المركزي لكل عملية مالية — **Append-only**، يحمل لقطة كاملة تفسّره لاحقاً (القسم 74)، ومرجعه `SW-YYYYMMDD-XXXXXXXX`، مقسّم شهرياً بـ `RANGE(tx_date)` بمفتاح `(id, tx_date)`.

```sql
-- transactions: كل عملية مالية ذرّية idempotent مسجلة — لا تعديل ولا حذف (R-03/R-04, Master §74)
CREATE TABLE transactions (
  id                    UUID NOT NULL DEFAULT gen_random_uuid(),
  tx_date               DATE NOT NULL DEFAULT CURRENT_DATE,     -- مفتاح القسم الشهري
  reference             VARCHAR(30) NOT NULL,                   -- SW-YYYYMMDD-XXXXXXXX
  txn_type              transaction_type NOT NULL,
  service_code          VARCHAR(40) NOT NULL,                   -- من سجل services (§5.6)
  status                transaction_status NOT NULL DEFAULT 'CREATED',
  user_id               UUID NOT NULL,                          -- البادئ
  source_wallet_id      UUID,
  destination_wallet_id UUID,
  counterparty_user_id  UUID,
  agent_id              UUID,                                   -- FK → agents (§5.10)
  merchant_id           UUID,                                   -- FK → merchants (§5.10)
  terminal_id           UUID,                                   -- FK → terminals (§5.10)
  currency_code         CHAR(3) NOT NULL,
  amount                NUMERIC(18,4) NOT NULL,
  fee_amount            NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(18,4) NOT NULL,                 -- amount + fee_amount
  fee_rule_id           UUID,                                   -- لقطة الرسوم (Master §37)
  fee_rule_version      INTEGER,
  exchange_rate_id      UUID,                                   -- لقطة FX (FR-WLT-006)
  exchange_rate_value   NUMERIC(21,8),
  provider_code         VARCHAR(40),
  external_reference    VARCHAR(100),                           -- مرجع المزود (Master §103)
  idempotency_key_id    UUID,
  risk_decision         risk_decision,                          -- قرار محرك المخاطر
  metadata              JSONB NOT NULL DEFAULT '{}',            -- لقطة كاملة (Master §74)
  reversal_of_reference VARCHAR(30),                            -- ربط العكس بالأصل (Master §75)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  PRIMARY KEY (id, tx_date),
  CONSTRAINT ck_tx_reference CHECK (reference ~ '^SW-[0-9]{8}-[A-Z0-9]{8}$'),
  CONSTRAINT ck_tx_amounts CHECK (amount > 0 AND fee_amount >= 0 AND total_amount = amount + fee_amount),
  CONSTRAINT ck_tx_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_source_wallet FOREIGN KEY (source_wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_dest_wallet FOREIGN KEY (destination_wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_counterparty FOREIGN KEY (counterparty_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_fee_rule FOREIGN KEY (fee_rule_id) REFERENCES fee_rules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_fx_rate FOREIGN KEY (exchange_rate_id) REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tx_idem FOREIGN KEY (idempotency_key_id) REFERENCES idempotency_keys(id) ON DELETE RESTRICT
) PARTITION BY RANGE (tx_date);
CREATE INDEX idx_tx_user_date ON transactions (user_id, tx_date DESC);
CREATE INDEX idx_tx_status_date ON transactions (status, created_at);
CREATE INDEX idx_tx_type_date ON transactions (txn_type, status, tx_date);
CREATE INDEX idx_tx_reference ON transactions (reference);
CREATE INDEX idx_tx_pending ON transactions (tx_date) WHERE status IN ('PROCESSING','AUTHORIZED','UNDER_REVIEW');  -- قائمة العمليات المعلقة (Master §105)
CREATE INDEX idx_tx_metadata ON transactions USING GIN (metadata jsonb_path_ops);
-- FKs إلى agents/merchants/terminals وreversal_of_reference تُضاف في §5.10
```

### transaction_references
فهرس المرجع العالمي — يضمن **تفرد `SW-…` عبر كل الأقسام الشهرية** (قيد فريد على جدول غير مقسّم) ويستخدم للبحث المركزي (FR-ADM-008، Master §61/§73) وربط المعاملة العكسية بالأصل.

```sql
-- transaction_references: مرجع فريد عالمياً → (transaction_id, tx_date) — يُنشأ داخل نفس TX
CREATE TABLE transaction_references (
  reference       VARCHAR(30) PRIMARY KEY,
  transaction_id  UUID NOT NULL,
  tx_date         DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_tref_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
```

### transaction_items
بنود المعاملة — كل ساق محاسبية (الأصل، الرسوم، **عمولة الوكيل**، هامش FX، Hold/Release) بلقطة الحساب والمبلغ؛ من هنا تُولَّد قيود `ledger_entries` وتُقرأ تفاصيل كشف الحساب (Master §71/§101، FR-ADM-019).

```sql
-- transaction_items: بنود تفسّر توزيع المبلغ داخل المعاملة — لقطة لكل ساق (Append-only)
CREATE TABLE transaction_items (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id UUID NOT NULL,
  tx_date        DATE NOT NULL,
  item_type      transaction_item_type NOT NULL,
  account_id     UUID NOT NULL,          -- الحساب المحاسبي للساق
  wallet_id      UUID,                   -- المحفظة المعنية إن وجدت
  direction      ledger_entry_type NOT NULL,
  amount         NUMERIC(18,4) NOT NULL,
  currency_code  CHAR(3) NOT NULL,
  description    VARCHAR(200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ti_amount CHECK (amount > 0),
  CONSTRAINT ck_ti_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_ti_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT,
  CONSTRAINT fk_ti_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ti_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT
);
CREATE INDEX idx_ti_transaction ON transaction_items (transaction_id, tx_date);
```

### transaction_status_history
تاريخ انتقالات الحالة — **لا انتقال مسموح غير مسجل**؛ كل صف يسجل من/إلى والفاعل والسبب (Master §17، FR-LDG).

```sql
-- transaction_status_history: كل انتقال حالة مع الفاعل والسبب — Append-only (Master §17)
CREATE TABLE transaction_status_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id UUID NOT NULL,
  tx_date        DATE NOT NULL,
  from_status    transaction_status,
  to_status      transaction_status NOT NULL,
  changed_by     UUID,
  actor_type     actor_type NOT NULL DEFAULT 'SYSTEM',
  reason         VARCHAR(300),
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_tsh_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_tsh_transaction ON transaction_status_history (transaction_id, tx_date);
```

### deposit_requests
طلب الإيداع عبر وكيل — لا إتمام إلا بعد تأكيد الوكيل واستلام النقد ثم تحقق الخادم وLedger (Master §20/§21).

```sql
-- deposit_requests: طلب إيداع (CREATED→PENDING→CONFIRMED→COMPLETED أو رفض/انتهاء) (Master §21)
CREATE TABLE deposit_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,                   -- يُربط عند التنفيذ
  tx_date        DATE,
  user_id        UUID NOT NULL,
  agent_id       UUID NOT NULL,          -- FK → agents (§5.10)
  amount         NUMERIC(18,4) NOT NULL,
  currency_code  CHAR(3) NOT NULL,
  status         deposit_request_status NOT NULL DEFAULT 'CREATED',
  reject_reason  VARCHAR(200),           -- FR-CWD-006
  expires_at     TIMESTAMPTZ,
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT ck_dep_amount CHECK (amount > 0),
  CONSTRAINT ck_dep_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_dep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dep_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_dep_agent_status ON deposit_requests (agent_id, status);
```

### withdrawal_requests
طلب السحب مع **Hold على المبلغ** (رصيد مجمّد) ورمز قبض يُستهلك مرة واحدة وصلاحية تنتهي بتحرير تلقائي (Master §22/§23، FR-CWD-002/003).

```sql
-- withdrawal_requests: آلة حالة السحب الكاملة + رمز القبض هاش + تحرير Hold عند الانتهاء
CREATE TABLE withdrawal_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       UUID,
  tx_date              DATE,
  user_id              UUID NOT NULL,
  agent_id             UUID NOT NULL,            -- FK → agents (§5.10)
  amount               NUMERIC(18,4) NOT NULL,
  fee_amount           NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code        CHAR(3) NOT NULL,
  status               withdrawal_status NOT NULL DEFAULT 'CREATED',
  withdrawal_code_hash VARCHAR(255),             -- رمز القبض مرة واحدة (FR-CWD-002)
  hold_released_at     TIMESTAMPTZ,              -- تحرير المجمّد عند EXPIRED (FR-CWD-003)
  collected_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  reject_reason        VARCHAR(200),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID, updated_by UUID,
  CONSTRAINT ck_wd_amount CHECK (amount > 0 AND fee_amount >= 0),
  CONSTRAINT ck_wd_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_wd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wd_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_wd_agent_status ON withdrawal_requests (agent_id, status);
CREATE INDEX idx_wd_expiry ON withdrawal_requests (status, expires_at)
  WHERE status IN ('AUTHORIZED','READY_FOR_COLLECTION');
```

### payments
مدفوعات التجار — عبر مسح QR أو إدخال POSCOF أو طلب دفع مباشر (Pay Request)؛ يُرفض الدفع لجهة لا يستطيع الخادم التحقق من هويتها (Master §24، FR-PAY).

```sql
-- payments: دفع للتاجر عبر (QR/POSCOF/PAY_REQUEST) — مرتبط 1:1 بمعاملة مركزية
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  tx_date        DATE NOT NULL,
  payer_user_id  UUID NOT NULL,
  merchant_id    UUID NOT NULL,          -- FK → merchants (§5.10)
  branch_id      UUID,                   -- FK → merchant_branches (§5.10)
  terminal_id    UUID,                   -- FK → terminals (§5.10)
  qr_code_id     UUID,                   -- FK → qr_codes (§5.10)
  method         payment_method NOT NULL,
  amount         NUMERIC(18,4) NOT NULL,
  currency_code  CHAR(3) NOT NULL,
  status         transaction_status NOT NULL DEFAULT 'CREATED',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT ck_pay_amount CHECK (amount > 0),
  CONSTRAINT ck_pay_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_pay_payer FOREIGN KEY (payer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_pay_merchant ON payments (merchant_id, created_at DESC);
```

### remittance_orders
الحوالات إلى غير المشتركين — المبلغ يُخصم فوراً (Ledger) ويبقى في حساب معلق حتى التسليم أو الإرجاع، برمز تسليم مرة واحدة وصلاحية قابلة للتهيئة (FR-REM).

```sql
-- remittance_orders: حوالة لغير مشترك + رمز تسليم هاش + مدينة/وكيل مقترح + مهلة انتهاء
CREATE TABLE remittance_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id         UUID NOT NULL,
  tx_date                DATE NOT NULL,
  sender_user_id         UUID NOT NULL,
  recipient_name         VARCHAR(120) NOT NULL,
  recipient_phone        VARCHAR(16) NOT NULL,
  destination_district_id UUID,          -- المديرية/المدينة المقترحة
  agent_id               UUID,           -- FK → agents (§5.10): الوكيل المسلِّم
  amount                 NUMERIC(18,4) NOT NULL,
  fee_amount             NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code          CHAR(3) NOT NULL,
  delivery_code_hash     VARCHAR(255) NOT NULL,   -- رمز التسليم مرة واحدة (FR-REM-002)
  status                 remittance_status NOT NULL DEFAULT 'CREATED',
  expires_at             TIMESTAMPTZ NOT NULL,    -- FR-REM-008: EXPIRED → إرجاع Reversal
  delivered_at           TIMESTAMPTZ,
  cancel_reason          VARCHAR(200),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID, updated_by UUID,
  CONSTRAINT ck_rem_amount CHECK (amount > 0),
  CONSTRAINT ck_rem_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_rem_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rem_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT,
  CONSTRAINT fk_rem_district FOREIGN KEY (destination_district_id) REFERENCES districts(id) ON DELETE RESTRICT
);
CREATE INDEX idx_rem_status_expiry ON remittance_orders (status, expires_at);
```

### remittance_deliveries
وقائع/محاولات تسليم الحوالة لدى الوكيل مع تحقق الهوية — قد تتعدد المحاولات وواحدة ناجحة (FR-REM-003).

```sql
-- remittance_deliveries: تسليم الحوالة (تحقق الرمز + هوية المستلم + المبلغ المدفوع نقداً)
CREATE TABLE remittance_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_order_id UUID NOT NULL,
  agent_id            UUID NOT NULL,           -- FK → agents (§5.10)
  agent_user_id       UUID NOT NULL,           -- حساب الوكيل المنفّذ
  id_doc_type         VARCHAR(30),             -- نوع هوية المستلم
  id_doc_last4        VARCHAR(4),              -- آخر 4 خانات فقط (تقليل البيانات الحساسة)
  amount_delivered    NUMERIC(18,4),
  is_successful       BOOLEAN NOT NULL DEFAULT false,
  delivered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_rd_order FOREIGN KEY (remittance_order_id) REFERENCES remittance_orders(id) ON DELETE RESTRICT
);
CREATE INDEX idx_rd_agent ON remittance_deliveries (agent_id, delivered_at DESC);
```

### adjustment_requests
التعديل المالي الرسمي الوحيد — طلب (مبلغ + سبب + مرجع) → موافقة ثانية (Maker-Checker) → معاملة REVERSAL/ADJUSTMENT في Ledger + Audit. **لا يوجد أي مسار آخر لتغيير رصيد** (R-05، Master §43).

```sql
-- adjustment_requests: كل تعديل مالي موثق بموافقة ثانية — طالب≠معتمد (Master §43)
CREATE TABLE adjustment_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code       VARCHAR(30) NOT NULL,
  target_account_id  UUID NOT NULL,          -- حساب الدليل المستهدف
  direction          ledger_entry_type NOT NULL,   -- DEBIT=خصم / CREDIT=إضافة
  amount             NUMERIC(18,4) NOT NULL,
  currency_code      CHAR(3) NOT NULL,
  reason             VARCHAR(500) NOT NULL,
  external_reference VARCHAR(100),
  status             adjustment_status NOT NULL DEFAULT 'PENDING',
  requested_by       UUID NOT NULL,           -- FK → admin_users (§5.10)
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by        UUID,                    -- FK → admin_users (§5.10)
  approved_at        TIMESTAMPTZ,
  transaction_id     UUID, tx_date DATE,      -- المعاملة الناتجة عند EXECUTED
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID, updated_by UUID,
  CONSTRAINT uq_adj_code UNIQUE (request_code),
  CONSTRAINT ck_adj_amount CHECK (amount > 0),
  CONSTRAINT ck_adj_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_adj_maker_checker CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT fk_adj_account FOREIGN KEY (target_account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_adj_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
```

### provider_webhook_events
استقبال أحداث المزودين (شحن/فواتير/شبكات صرافة) بشكل idempotent — الحدث يُستهلك مرة واحدة وبتوقيع مُتحقق، قبل أي أثر مالي (Master §68/§69).

```sql
-- provider_webhook_events: (provider_code, event_id) فريد — نفس الحدث لا يعالج مرتين
CREATE TABLE provider_webhook_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code      VARCHAR(40) NOT NULL,
  event_id           VARCHAR(100) NOT NULL,
  event_type         VARCHAR(60) NOT NULL,
  payload            JSONB NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  status             webhook_status NOT NULL DEFAULT 'RECEIVED',
  processed_at       TIMESTAMPTZ,
  error              VARCHAR(500),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook UNIQUE (provider_code, event_id)
);
CREATE INDEX idx_webhook_status ON provider_webhook_events (status, received_at);
```

## 5.5 المجموعة الخامسة — الشبكات والوكلاء والتجار

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| agents | الوكلاء ونقاط الخدمة | ← users, regions؛ → float/قواعد/تسويات |
| agent_float_accounts | رصيد تشغيل الوكيل لكل عملة | → agents, ledger_accounts |
| agent_commission_rules | قواعد عمولات الوكلاء | → agents, regions |
| agent_daily_settlements | تسوية الوكيل اليومية | → agents |
| merchants | التجار (POSCOF الجذر) | ← users, regions؛ → فروع/تسويات |
| merchant_branches | فروع التاجر | → merchants, regions |
| terminals | نقاط البيع | → merchant_branches |
| qr_codes | رموز QR الموقّعة | → terminals |
| merchant_settlements | تسويات التاجر الدورية | → merchants |
| networks | شبكات الجوال | → network_products |
| network_products | منتجات/باقات الشحن | → networks؛ → topups/network_cards |

### agents
الوكيل = مستخدم بحساب موثق + ملف وكيل (كود، منطقة، موقع، ساعات عمل) وحالة آلة `agent_status` وحدود عبر `limit_rules` (Master §99، FR-ADM-016).

```sql
-- agents: نقاط خدمة معتمدة تنفذ إيداع/سحب/تسليم حوالات — مرتبطة بحساب مستخدم واحد
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  agent_code    VARCHAR(20) NOT NULL,
  business_name VARCHAR(120) NOT NULL,
  region_id     UUID NOT NULL,
  district_id   UUID,
  address       VARCHAR(300),
  latitude      NUMERIC(9,6),              -- خريطة الوكلاء (FR-CWD-004)
  longitude     NUMERIC(9,6),
  working_hours VARCHAR(200),
  status        agent_status NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_agents_user UNIQUE (user_id),
  CONSTRAINT uq_agents_code UNIQUE (agent_code),
  CONSTRAINT fk_agents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_agents_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_agents_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT
);
CREATE INDEX idx_agents_geo ON agents (region_id, district_id, status);
```

### agent_float_accounts
رصيد تشغيل الوكيل — **القرار (M-09):** Float هو حساب `AGENT_FLOAT` في `ledger_accounts` (مصدر الحقيقة)، وهذا الجدول هو الرابط التشغيلي لكل (وكيل × عملة) مع كاش `current_balance` يُحدَّث داخل نفس معاملة قاعدة البيانات ويطابقه Reconciliation، مع حد تنبيه النضوب (Master §100، FR-ADM-017، RK-05).

```sql
-- agent_float_accounts: رصيد التشغيل لكل (agent x currency) + عتبة تنبيه النضوب
CREATE TABLE agent_float_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID NOT NULL,
  currency_code         CHAR(3) NOT NULL,
  ledger_account_id     UUID NOT NULL,        -- حساب AGENT_FLOAT في الدليل
  current_balance       NUMERIC(18,4) NOT NULL DEFAULT 0,   -- كاش يتحقق منه Reconciliation
  low_balance_threshold NUMERIC(18,4) NOT NULL DEFAULT 0,
  last_topup_at         TIMESTAMPTZ,
  status                record_status NOT NULL DEFAULT 'ACTIVE',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID, updated_by UUID,
  CONSTRAINT uq_agent_float UNIQUE (agent_id, currency_code),
  CONSTRAINT uq_agent_float_account UNIQUE (ledger_account_id),
  CONSTRAINT ck_af_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_af_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_af_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX idx_af_low ON agent_float_accounts (agent_id) WHERE current_balance < low_balance_threshold;
```

### agent_commission_rules
قواعد عمولات الوكلاء — خارج كود التطبيق نهائياً، وتُثبَّت لقطة العمولة داخل `transaction_items` بند `AGENT_COMMISSION` لكل معاملة (Master §101، FR-ADM-019).

```sql
-- agent_commission_rules: عمولة بالفئة/المبلغ/المنطقة — NULL للوكيل = قاعدة افتراضية عامة
CREATE TABLE agent_commission_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID,
  region_id       UUID,
  service_code    VARCHAR(40) NOT NULL,
  calc_type       fee_calc_type NOT NULL,
  fixed_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
  percentage      NUMERIC(6,4) NOT NULL DEFAULT 0,
  min_commission  NUMERIC(18,4) NOT NULL DEFAULT 0,
  max_commission  NUMERIC(18,4),
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to    TIMESTAMPTZ,
  status          record_status NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID, updated_by UUID,
  CONSTRAINT ck_acr_pct CHECK (percentage >= 0),
  CONSTRAINT fk_acr_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_acr_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT
);
```

### agent_daily_settlements
تسوية الوكيل اليومية — Cash In/Out والعمولات وفتح/إغلاق Float والفرق (Variance)، قابلة للتصدير (Master §100، FR-ADM-018).

```sql
-- agent_daily_settlements: صف وحيد لكل (agent x date x currency) يُجمَّع من المعاملات
CREATE TABLE agent_daily_settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL,
  settlement_date   DATE NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  cash_in_total     NUMERIC(18,4) NOT NULL DEFAULT 0,
  cash_out_total    NUMERIC(18,4) NOT NULL DEFAULT 0,
  commissions_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  float_opening     NUMERIC(18,4) NOT NULL DEFAULT 0,
  float_closing     NUMERIC(18,4) NOT NULL DEFAULT 0,
  variance          NUMERIC(18,4) NOT NULL DEFAULT 0,
  tx_count          INTEGER NOT NULL DEFAULT 0,
  status            settlement_status NOT NULL DEFAULT 'PENDING',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_agent_settlement UNIQUE (agent_id, settlement_date, currency_code),
  CONSTRAINT ck_ads_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_ads_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);
```

### merchants
التاجر — كيان مستقل بفروع ونقاط بيع وQR وعمولة وسياسة تسوية (فورية/يومية/أسبوعية) وحدود دفع عبر `limit_rules` (Master §25، FR-PAY-005/006).

```sql
-- merchants: POSCOF الجذر + نسبة عمولة + سياسة التسوية — مالكه مستخدم تاجر اختياري
CREATE TABLE merchants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID,                     -- حساب التاجر في التطبيق (وضع التاجر)
  merchant_code     VARCHAR(20) NOT NULL,
  name              VARCHAR(120) NOT NULL,
  category          VARCHAR(40),
  region_id         UUID NOT NULL,
  commission_pct    NUMERIC(6,4) NOT NULL DEFAULT 0,
  settlement_policy VARCHAR(20) NOT NULL DEFAULT 'DAILY',
  status            merchant_status NOT NULL DEFAULT 'PENDING',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_merchants_user UNIQUE (user_id),
  CONSTRAINT uq_merchants_code UNIQUE (merchant_code),
  CONSTRAINT ck_merchants_policy CHECK (settlement_policy IN ('INSTANT','DAILY','WEEKLY')),
  CONSTRAINT fk_merchants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_merchants_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT
);
```

### merchant_branches
فروع التاجر مع موقع جغرافي — التجار بفروع متعددة بإدارة كاملة من لوحة التحكم (FR-PAY-005).

```sql
-- merchant_branches: فرع = (merchant x code) مع موقع وساعات ورمز
CREATE TABLE merchant_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  code        VARCHAR(20) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  region_id   UUID NOT NULL,
  district_id UUID,
  address     VARCHAR(300),
  latitude    NUMERIC(9,6),
  longitude   NUMERIC(9,6),
  phone       VARCHAR(16),
  status      record_status NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID, updated_by UUID,
  CONSTRAINT uq_branch_code UNIQUE (merchant_id, code),
  CONSTRAINT fk_branch_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT
);
```

### terminals
نقاط البيع (POSCOF) لكل فرع — الرقم الذي يُدخل يدوياً للدفع وحلّ التاجر من الخادم (FR-PAY-002).

```sql
-- terminals: رقم نقطة بيع فريد عالمياً لكل فرع (Master §24)
CREATE TABLE terminals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL,
  terminal_code VARCHAR(24) NOT NULL,
  name         VARCHAR(120),
  status       record_status NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID, updated_by UUID,
  CONSTRAINT uq_terminals_code UNIQUE (terminal_code),
  CONSTRAINT fk_terminals_branch FOREIGN KEY (branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT
);
```

### qr_codes
رموز QR لكل نقطة بيع — **لا ثقة بنص QR وحده**؛ الخادم يفك التوقيع ويتحقق من الحمولة `(merchant, terminal, currency, amount, reference, version, signature)` (Master §26، FR-PAY-001/007).

```sql
-- qr_codes: STATIC (مفتوح المبلغ) أو DYNAMIC (بمبلغ وانتهاء) — موقّعة من الخادم
CREATE TABLE qr_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id    UUID NOT NULL,
  qr_type        qr_type NOT NULL DEFAULT 'STATIC',
  currency_code  CHAR(3),
  amount         NUMERIC(18,4),
  payload_version SMALLINT NOT NULL DEFAULT 1,
  signature      VARCHAR(344) NOT NULL,      -- توقيع الخادم المخزن للتحقق
  expires_at     TIMESTAMPTZ,                -- للديناميكي فقط (Master §26)
  usage_count    INTEGER NOT NULL DEFAULT 0,
  status         qr_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT ck_qr_amount CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT ck_qr_currency CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_qr_terminal FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT
);
CREATE INDEX idx_qr_terminal_active ON qr_codes (terminal_id, status);
```

### merchant_settlements
تسويات التاجر الدورية — إجمالي المدفوعات ناقص الرسوم/العمولة = الصافي، بسياسة لكل تاجر (Master §102، FR-PAY-006).

```sql
-- merchant_settlements: كشف تسوية لكل فترة (merchant x period x currency)
CREATE TABLE merchant_settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  currency_code CHAR(3) NOT NULL,
  gross_amount  NUMERIC(18,4) NOT NULL DEFAULT 0,
  fees_deducted NUMERIC(18,4) NOT NULL DEFAULT 0,
  net_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
  tx_count      INTEGER NOT NULL DEFAULT 0,
  status        settlement_status NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_merchant_settlement UNIQUE (merchant_id, period_start, period_end, currency_code),
  CONSTRAINT ck_ms_period CHECK (period_end >= period_start),
  CONSTRAINT ck_ms_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_ms_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT
);
```

### networks
شبكات الجوال العاملة في جنوب اليمن — كيان إداري بحالة خدمة وAdapter لكل مزود (Master §28، FR-TOP-001).

```sql
-- networks: الشبكة (اسم/شعار/تفعيل) + adapter_code للمزود — تفعيل/تعطيل مركزي
CREATE TABLE networks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) NOT NULL,
  name          VARCHAR(80) NOT NULL,
  logo_url      VARCHAR(500),
  adapter_code  VARCHAR(40) NOT NULL,
  provider_code VARCHAR(40),
  status        service_status NOT NULL DEFAULT 'ON',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_networks_code UNIQUE (code)
);
```

### network_products
منتجات الشحن (Prepaid/Postpaid/Bundles/Internet/Cards) لكل شبكة بأسعار مُدارة (Master §29).

```sql
-- network_products: (network x product_code) فريد — face_value للبيع وسعر البيع
CREATE TABLE network_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id    UUID NOT NULL,
  product_code  VARCHAR(40) NOT NULL,
  display_name  VARCHAR(120) NOT NULL,
  category      VARCHAR(30) NOT NULL,       -- PREPAID/POSTPAID/BUNDLE/INTERNET/CARD
  face_value    NUMERIC(18,4) NOT NULL,
  sell_price    NUMERIC(18,4) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status        record_status NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_network_products UNIQUE (network_id, product_code),
  CONSTRAINT ck_np_price CHECK (sell_price > 0 AND face_value > 0),
  CONSTRAINT ck_np_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_np_network FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE RESTRICT
);
```

## 5.6 المجموعة السادسة — الخدمات (شحن/فواتير/كروت/حصالة)

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| services | سجل الخدمات الموحد وحالة كل خدمة | مرجع service_code في transactions/fee_rules |
| topups | عمليات شحن الرصيد | → transactions, networks, network_products |
| network_cards | مخزون كروت الشبكة (كود مشفّر) | → networks, network_products |
| network_card_sales | وقائع بيع الكروت | → network_cards, transactions |
| bill_providers | مقدمو خدمات الفواتير | → bill_products |
| bill_products | منتجات الفواتير ومخطط الحقول | → bill_providers؛ → bill_payments |
| bill_payments | سداد الفواتير بلقطة استعلام | → transactions, providers, products |
| savings_accounts | أهداف الحصالة (حساب SAVINGS) | → users, ledger_accounts |
| savings_transactions | سجل عمليات الحصالة | → savings_accounts, transactions |
| digital_assets | الأصول الرقمية (مؤجل) | → crypto_addresses/transactions |
| blockchain_networks | شبكات البلوكشين (مؤجل) | → crypto_addresses |
| crypto_addresses | عناوين المستخدمين (مؤجل) | → users, assets, networks |
| crypto_transactions | حركات الأصول (مؤجل) | → addresses, assets, networks |

### services
سجل الخدمات الموحد — كل خدمة معرفة بـ (فئة، مزود، حقول، تسعير، سير عمل، تفعيل) وحالة `ON/OFF/MAINTENANCE` لكل خدمة على حدة؛ الخادم يمنع الجديد فوراً عند الإيقاف (Master §33/§49، FR-LDG-014، FR-ADM-037).

```sql
-- services: محرك الخدمات — لا شاشات مستقلة بلا بنية؛ الحالة تُقرأ عند كل طلب جديد
CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(40) NOT NULL,
  name          VARCHAR(80) NOT NULL,
  category      VARCHAR(40) NOT NULL,        -- FINANCE/TOPUP/BILL/CARD/SAVINGS/CRYPTO
  provider_kind VARCHAR(40),                 -- نوع المزود/Adapter
  fields_schema JSONB NOT NULL DEFAULT '{}', -- حقول إدخال الخدمة
  config        JSONB NOT NULL DEFAULT '{}', -- تسعير/حدود/سير عمل إضافي
  status        service_status NOT NULL DEFAULT 'ON',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID, updated_by UUID,
  CONSTRAINT uq_services_code UNIQUE (code)
);
```

### topups
عمليات شحن الرصيد — الحالة Pending معروضة بوضوح أثناء المعالجة ولا «نجاح» إلا بعد نتيجة المزود الفعلية (Master §27، FR-TOP-004/005).

```sql
-- topups: شحنة لرقم المستخدم أو رقم آخر عبر منتج شبكة — مرتبطة 1:1 بمعاملة
CREATE TABLE topups (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     UUID NOT NULL,
  tx_date            DATE NOT NULL,
  network_id         UUID NOT NULL,
  network_product_id UUID NOT NULL,
  target_phone       VARCHAR(16) NOT NULL,    -- FR-TOP-002
  amount             NUMERIC(18,4) NOT NULL,
  currency_code      CHAR(3) NOT NULL,
  provider_reference VARCHAR(100),
  status             transaction_status NOT NULL DEFAULT 'CREATED',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID, updated_by UUID,
  CONSTRAINT ck_topup_amount CHECK (amount > 0),
  CONSTRAINT ck_topup_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_topup_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT,
  CONSTRAINT fk_topup_network FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_topup_product FOREIGN KEY (network_product_id) REFERENCES network_products(id) ON DELETE RESTRICT
);
CREATE INDEX idx_topups_network ON topups (network_id, status);
```

### network_cards
مخزون كروت الشبكة — الكود **مشفّر (BYTEA بمفتاح KMS خارجي)** ولا يُستهلك الكرت إلا بعد نجاح الدفع (Master §32، FR-NWC-002).

```sql
-- network_cards: IN_STOCK→RESERVED→SOLD — فشل الدفع = عودة إلى IN_STOCK
CREATE TABLE network_cards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id     UUID NOT NULL,
  product_id     UUID NOT NULL,
  serial         VARCHAR(40) NOT NULL,        -- رقم تسلسلي للمخزون
  code_encrypted BYTEA NOT NULL,              -- كود الكرت مشفّراً — لا نص صريح
  face_value     NUMERIC(18,4) NOT NULL,
  currency_code  CHAR(3) NOT NULL,
  status         network_card_status NOT NULL DEFAULT 'IN_STOCK',
  reserved_at    TIMESTAMPTZ,
  sold_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT uq_network_cards_serial UNIQUE (network_id, serial),
  CONSTRAINT ck_nc_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_nc_network FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_nc_product FOREIGN KEY (product_id) REFERENCES network_products(id) ON DELETE RESTRICT
);
CREATE INDEX idx_nc_available ON network_cards (network_id, product_id, status);
```

### network_card_sales
وقائع بيع الكروت — الكشف الآمن للكود بعد الدفع فقط مع عدّاد إعادة العرض (FR-NWC-003).

```sql
-- network_card_sales: واقعة بيع واحدة لكل كرت — الكود لا يظهر قبل نجاح الدفع
CREATE TABLE network_card_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL,
  tx_date         DATE NOT NULL,
  network_card_id UUID NOT NULL,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count      SMALLINT NOT NULL DEFAULT 0,   -- إعادة العرض ضمن صلاحية أمنية
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ncs_card UNIQUE (network_card_id),
  CONSTRAINT fk_ncs_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT,
  CONSTRAINT fk_ncs_card FOREIGN KEY (network_card_id) REFERENCES network_cards(id) ON DELETE RESTRICT
);
```

### bill_providers
مقدمو خدمات الفواتير (إنترنت/هاتف/خدمات) — كيانات مُدارة مع تفعيل فردي ودعم استعلام فوري (FR-BIL-003).

```sql
-- bill_providers: مزود فواتير + adapter + inquiry_supported يحدد سياسة المبلغ
CREATE TABLE bill_providers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(40) NOT NULL,
  name              VARCHAR(120) NOT NULL,
  category          VARCHAR(40) NOT NULL,     -- INTERNET/LANDLINE/ELECTRICITY/...
  adapter_code      VARCHAR(40) NOT NULL,
  inquiry_supported BOOLEAN NOT NULL DEFAULT true,   -- FR-BIL-002
  status            service_status NOT NULL DEFAULT 'ON',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_bill_providers_code UNIQUE (code)
);
```

### bill_products
منتجات الفواتير لكل مزود — نوع الفاتورة ومخطط حقول رقم المشترك (FR-BIL-003).

```sql
-- bill_products: (provider x code) فريد مع fields_schema JSONB لحقول الإدخال
CREATE TABLE bill_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL,
  code         VARCHAR(40) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  fields_schema JSONB NOT NULL DEFAULT '{}',
  status       record_status NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID, updated_by UUID,
  CONSTRAINT uq_bill_products UNIQUE (provider_id, code),
  CONSTRAINT fk_bp_provider FOREIGN KEY (provider_id) REFERENCES bill_providers(id) ON DELETE RESTRICT
);
```

### bill_payments
سداد الفواتير — لقطة استعلام المزود (المستحق) محفوظة، وسياسة فشل واضحة Pending → Retry → Refund بلا خصم غير مفسّر (FR-BIL-004).

```sql
-- bill_payments: رقم مشترك + لقطة الفاتورة + مرجع المزود — مرتبطة 1:1 بمعاملة
CREATE TABLE bill_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     UUID NOT NULL,
  tx_date            DATE NOT NULL,
  provider_id        UUID NOT NULL,
  bill_product_id    UUID NOT NULL,
  subscriber_number  VARCHAR(40) NOT NULL,
  due_amount         NUMERIC(18,4),           -- من الاستعلام الفوري
  paid_amount        NUMERIC(18,4) NOT NULL,
  currency_code      CHAR(3) NOT NULL,
  bill_snapshot      JSONB,                   -- لقطة نتيجة الاستعلام (Master §74)
  provider_reference VARCHAR(100),
  status             transaction_status NOT NULL DEFAULT 'CREATED',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID, updated_by UUID,
  CONSTRAINT ck_bp_amount CHECK (paid_amount > 0),
  CONSTRAINT ck_bp_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_bpay_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT,
  CONSTRAINT fk_bpay_provider FOREIGN KEY (provider_id) REFERENCES bill_providers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bpay_product FOREIGN KEY (bill_product_id) REFERENCES bill_products(id) ON DELETE RESTRICT
);
```

### savings_accounts
أهداف الحصالة — **حساب `SAVINGS` فعلي في دليل الحسابات**، فالإيداع/السحب قيود Ledger حقيقية وليست رقماً وهمياً (Master §31، FR-SAV-001/002).

```sql
-- savings_accounts: هدف ادخار (عنوان/مستهدف/تاريخ) مرتبط بحساب SAVINGS 1:1
CREATE TABLE savings_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  ledger_account_id UUID NOT NULL,
  title             VARCHAR(120) NOT NULL,
  target_amount     NUMERIC(18,4) NOT NULL,
  current_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,  -- كاش يطابقه Reconciliation
  currency_code     CHAR(3) NOT NULL,
  target_date       DATE,
  status            savings_status NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_savings_ledger UNIQUE (ledger_account_id),
  CONSTRAINT ck_sav_target CHECK (target_amount > 0 AND current_amount >= 0),
  CONSTRAINT ck_sav_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT fk_sav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sav_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT
);
```

### savings_transactions
سجل عمليات الحصالة المفصل — كل إيداع/سحب مرتبط بمعاملة Ledger (FR-SAV-002/006).

```sql
-- savings_transactions: حركة حصالة (DEPOSIT/WITHDRAWAL) + الرصيد بعدها
CREATE TABLE savings_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  savings_account_id UUID NOT NULL,
  transaction_id     UUID NOT NULL,
  tx_date            DATE NOT NULL,
  savings_type       savings_tx_type NOT NULL,
  amount             NUMERIC(18,4) NOT NULL,
  balance_after      NUMERIC(18,4) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_st_amount CHECK (amount > 0),
  CONSTRAINT fk_st_account FOREIGN KEY (savings_account_id) REFERENCES savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_st_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
```

### digital_assets
الأصول الرقمية — نموذج منفصل عن العملات التقليدية ومؤجل (FR-CRY-001 Won't)؛ يبقى `INACTIVE` حتى قرار تفعيل منفصل.

```sql
-- digital_assets: أصل رقمي (USDT...) — كيان مستقل عن currencies (Master §34)
CREATE TABLE digital_assets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(20) NOT NULL,
  name       VARCHAR(80) NOT NULL,
  symbol     VARCHAR(10) NOT NULL,
  asset_kind VARCHAR(20) NOT NULL DEFAULT 'STABLECOIN',  -- STABLECOIN/COIN/TOKEN
  decimals   SMALLINT NOT NULL DEFAULT 6,
  status     record_status NOT NULL DEFAULT 'INACTIVE',  -- مؤجل حتى طبقة Custody (FR-CRY-002)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_digital_assets_code UNIQUE (code)
);
```

### blockchain_networks
شبكات البلوكشين (TRON/BSC/Ethereum) — لكل شبكة قواعد إيداع/سحب وتأكيدات ورسوم وحدود مستقلة (Master §35).

```sql
-- blockchain_networks: الشبكة كيان مستقل عن الأصل — USDT على TRON ≠ USDT على BSC
CREATE TABLE blockchain_networks (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     VARCHAR(20) NOT NULL,
  name                     VARCHAR(60) NOT NULL,
  deposit_enabled          BOOLEAN NOT NULL DEFAULT false,
  withdrawal_enabled       BOOLEAN NOT NULL DEFAULT false,
  minimum_deposit          NUMERIC(24,8),
  minimum_withdrawal       NUMERIC(24,8),
  confirmation_requirement INTEGER NOT NULL DEFAULT 12,
  network_fee              NUMERIC(24,8) NOT NULL DEFAULT 0,
  daily_limit              NUMERIC(24,8),
  status                   record_status NOT NULL DEFAULT 'INACTIVE',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID, updated_by UUID,
  CONSTRAINT uq_blockchain_networks_code UNIQUE (code)
);
```

### crypto_addresses
عناوين الإيداع لكل (مستخدم × أصل × شبكة) — **المفاتيح الخاصة في طبقة Custody خارجية فقط** ولا توضع في قاعدة البيانات ولا في التطبيق (Master §35، FR-CRY-002).

```sql
-- crypto_addresses: العنوان فقط (بدون أي مفاتيح خاصة) — فريد لكل شبكة
CREATE TABLE crypto_addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  asset_id   UUID NOT NULL,
  network_id UUID NOT NULL,
  address    VARCHAR(120) NOT NULL,
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_crypto_address UNIQUE (network_id, address),
  CONSTRAINT fk_ca_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ca_asset FOREIGN KEY (asset_id) REFERENCES digital_assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ca_network FOREIGN KEY (network_id) REFERENCES blockchain_networks(id) ON DELETE RESTRICT
);
```

### crypto_transactions
حركات الأصول الرقمية (مؤجلة) — عند التفعيل تُربط بمعاملة النظام المركزية وتخضع لنفس Ledger وIdempotency.

```sql
-- crypto_transactions: حركة (tx_hash/تأكيدات/اتجاه) — مرتبطة اختيارياً بمعاملة النظام
CREATE TABLE crypto_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID, tx_date DATE,          -- الربط عند التفعيل فقط
  address_id     UUID NOT NULL,
  asset_id       UUID NOT NULL,
  network_id     UUID NOT NULL,
  direction      crypto_direction NOT NULL,
  tx_hash        VARCHAR(128),
  amount         NUMERIC(24,8) NOT NULL,
  confirmations  INTEGER NOT NULL DEFAULT 0,
  status         crypto_tx_status NOT NULL DEFAULT 'PENDING',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID, updated_by UUID,
  CONSTRAINT ck_ct_amount CHECK (amount > 0),
  CONSTRAINT fk_ct_address FOREIGN KEY (address_id) REFERENCES crypto_addresses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ct_asset FOREIGN KEY (asset_id) REFERENCES digital_assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ct_network FOREIGN KEY (network_id) REFERENCES blockchain_networks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ct_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
```

## 5.7 المجموعة السابعة — الدعم والمحتوى

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| notification_templates | قوالب الإشعارات i18n بمتغيرات | → notifications |
| notifications | مركز الإشعارات + Push/SMS | → users, templates |
| support_tickets | تذاكر الدعم بآلة حالة | → users, transactions, admin_users |
| support_messages | رسائل محادثة التذكرة | → support_tickets |
| content | المحتوى المنفصل عن الكود | مستقل (type/slug/locale) |
| banners | بانرات الرئيسية والإعلانات | مستقل |
| faqs | الأسئلة الشائعة المصنّفة | مستقل |

### notification_templates
قوالب الإشعارات — عناوين ونصوص ثنائية اللغة (ar/en) بمتغيرات معرّفة وDeep Link صحيح لكل نوع (Master §54/§55، FR-NTF-004، FR-ADM-042).

```sql
-- notification_templates: (code x channel) فريد — i18n JSONB + variables + deep_link
CREATE TABLE notification_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(60) NOT NULL,
  type       notification_type NOT NULL,
  channel    notification_channel NOT NULL DEFAULT 'PUSH',
  title_i18n JSONB NOT NULL,                 -- {"ar":"...","en":"..."}
  body_i18n  JSONB NOT NULL,
  variables  JSONB NOT NULL DEFAULT '[]',
  deep_link  VARCHAR(200),
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_notif_templates UNIQUE (code, channel)
);
```

### notifications
مركز الإشعارات داخل التطبيق مع Push عبر FCM وSMS للأحداث الحرجة — الإشعار قناة إبلاغ فقط (R-13) ويحذف منطقياً (Master §54/§88، FR-NTF).

```sql
-- notifications: (title/body/type/deep_link/read_at) — ربط ناعم بالمعاملة بالمرجع
CREATE TABLE notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL,
  template_id          UUID,
  type                 notification_type NOT NULL,
  title                VARCHAR(200) NOT NULL,
  body                 TEXT NOT NULL,
  deep_link            VARCHAR(300),
  data                 JSONB NOT NULL DEFAULT '{}',
  channels             VARCHAR(30) NOT NULL DEFAULT 'IN_APP,PUSH',
  transaction_reference VARCHAR(30),        -- ربط بالمرجع دون FK صلب (قرار M-13)
  read_at              TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,         -- حذف منطقي للمحتوى فقط (Master §90)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID, updated_by UUID,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_notif_template FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE RESTRICT
);
CREATE INDEX idx_notif_unread ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;
```

### support_tickets
تذاكر الدعم — فئة + وصف + ارتباط مباشر بالعملية عند الإبلاغ منها (زر «الإبلاغ عن مشكلة» من تفاصيل العملية — Master §106، FR-SUP-002/003).

```sql
-- support_tickets: تذكرة بآلة حالة (OPEN→IN_PROGRESS→WAITING_USER→RESOLVED→CLOSED)
CREATE TABLE support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code       VARCHAR(20) NOT NULL,
  user_id           UUID NOT NULL,
  transaction_id    UUID, tx_date DATE,      -- الارتباط المباشر بالعملية (Master §106)
  category          VARCHAR(40) NOT NULL,
  subject           VARCHAR(200),
  priority          ticket_priority NOT NULL DEFAULT 'MEDIUM',
  status            ticket_status NOT NULL DEFAULT 'OPEN',
  assigned_admin_id UUID,                    -- FK → admin_users (§5.10)
  satisfaction_rating SMALLINT,              -- 1..5 (FR-SUP-006)
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID, updated_by UUID,
  CONSTRAINT uq_tickets_code UNIQUE (ticket_code),
  CONSTRAINT ck_ticket_rating CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5),
  CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ticket_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_tickets_status ON support_tickets (status, priority, created_at);
```

### support_messages
رسائل محادثة التذكرة (ذهاب/عودة) — المرفقات في Storage خارجي بمفاتيح موقّعة (FR-SUP-003).

```sql
-- support_messages: رسالة (مرسل/نص/مرفقات) — ترتيب زمني داخل التذكرة
CREATE TABLE support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL,
  sender_type message_sender_type NOT NULL,
  sender_id   UUID,                          -- مستخدم أو إداري حسب sender_type
  message     TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',   -- storage keys موقّعة (Master §122)
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_msg_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE RESTRICT
);
CREATE INDEX idx_msg_ticket ON support_messages (ticket_id, created_at);
```

### content
المحتوى المنفصل عن الكود — شروط/خصوصية/مقالات/أوصاف خدمات/أقسام الرئيسية/إعلانات، بإصدارات ونشر وحذف منطقي (Master §53، FR-ADM-039).

```sql
-- content: (type x slug x locale x version) فريد — نسخ محفوظة عند كل تعديل
CREATE TABLE content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type content_type NOT NULL,
  slug         VARCHAR(120) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  body         TEXT NOT NULL,
  locale       VARCHAR(5) NOT NULL DEFAULT 'ar',
  version      INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  status       record_status NOT NULL DEFAULT 'ACTIVE',
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID, updated_by UUID,
  CONSTRAINT uq_content UNIQUE (content_type, slug, locale, version)
);
```

### banners
بانرات الرئيسية والإعلانات — ترتيب ونافذة عرض وDeep Link (Master §53، FR-ADM-039).

```sql
-- banners: بانر (صورة/رابط/موضع/ترتيب/نافذة زمنية) — حذف منطقي فقط
CREATE TABLE banners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      VARCHAR(120) NOT NULL,
  image_url  VARCHAR(500) NOT NULL,
  deep_link  VARCHAR(300),
  placement  VARCHAR(40) NOT NULL DEFAULT 'HOME',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID
);
```

### faqs
الأسئلة الشائعة المصنّفة متعددة اللغات — تُدار من Content Admin وتُعرض في مركز المساعدة (FR-SUP-001).

```sql
-- faqs: سؤال/جواب مصنّف بترتيب — (category x question x locale) فريد
CREATE TABLE faqs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   VARCHAR(60) NOT NULL,
  question   VARCHAR(300) NOT NULL,
  answer     TEXT NOT NULL,
  locale     VARCHAR(5) NOT NULL DEFAULT 'ar',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_faqs UNIQUE (category, question, locale)
);
```

## 5.8 المجموعة الثامنة — الإدارة والصلاحيات

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| roles | الأدوار الإدارية السبعة + قابلة للإدارة | → admin_users, role_permissions |
| permissions | الصلاحيات الذرية | → role_permissions |
| role_permissions | الربط مع Scope | → roles, permissions |
| admin_users | مستخدمو اللوحة (منفصلون عن users) | → roles؛ → sessions |
| admin_sessions | جلسات اللوحة مع MFA | → admin_users |
| feature_flags | مفاتيح التشغيل التدريجي | مستقل |
| system_settings | الإعدادات المركزية key-value | مستقل |
| system_state | الحالة العالمية للمنظومة (صف وحيد) | مستقل |
| app_versions | إصدارات التطبيق وForce Update | مستقل |

### roles
الأدوار الإدارية — السبعة المعتمدة (Super Admin / Finance / Operations / Support / Content / Security / Auditor) وأدوار مستقبلية، قابلة للإدارة بالكامل (Master §46).

```sql
-- roles: دور إداري — is_system يمنع حذف الأدوار الجوهرية
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(80) NOT NULL,
  description VARCHAR(300),
  is_system   BOOLEAN NOT NULL DEFAULT false,
  status      record_status NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID, updated_by UUID,
  CONSTRAINT uq_roles_code UNIQUE (code)
);
```

### permissions
الصلاحيات الذرية — مثل `view_users / freeze_user / manage_fees / approve_adjustment / view_ledger / manage_networks / manage_content / manage_versions` (Master §47).

```sql
-- permissions: صلاحية ذرية قابلة للإسناد لأي دور
CREATE TABLE permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(60) NOT NULL,
  name       VARCHAR(120) NOT NULL,
  category   VARCHAR(40) NOT NULL,
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_permissions_code UNIQUE (code)
);
```

### role_permissions
ربط الدور بالصلاحية مع **مدى التنفيذ Scope** (الكل/منطقة/كيان) — الصلاحية ليست Role فقط (Master §47، FR-ADM-001).

```sql
-- role_permissions: (role x permission x scope) — NULLS NOT DISTINCT لمنع التكرار (PG15)
CREATE TABLE role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID NOT NULL,
  permission_id UUID NOT NULL,
  scope_type    scope_type NOT NULL DEFAULT 'GLOBAL',
  scope_id      UUID,                        -- region_id أو معرف كيان عند التقييد
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  CONSTRAINT uq_role_permissions UNIQUE NULLS NOT DISTINCT (role_id, permission_id, scope_type, scope_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT
);
```

### admin_users
مستخدمو لوحة التحكم — **القرار (M-10): منفصلون تماماً عن `users`** لعزل سطح الهجوم المالي عن حسابات التطبيق: مصادقة أقوى (كلمة مرور + MFA إلزامي + قيود IP + قفل محاولات)، وجدول بمنطق دورة حياة مختلف، وأي اختراق لحساب عميل لا يمنح أي مسار إداري (Master §78، FR-ADM-002، NFR-SEC-009).

```sql
-- admin_users: حساب إداري منفصل — MFA إجباري وقيود IP وسر MFA مشفّر بمفتاح خارجي
CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        VARCHAR(60) NOT NULL,
  email           VARCHAR(160) NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role_id         UUID NOT NULL,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT true,
  mfa_secret_enc  BYTEA,                     -- مشفّر بمفتاح KMS خارج القاعدة (P-15)
  ip_restrictions INET[],                    -- قيود IP اختيارية (FR-ADM-002)
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  status          account_status NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID, updated_by UUID,
  CONSTRAINT uq_admin_username UNIQUE (username),
  CONSTRAINT uq_admin_email UNIQUE (email),
  CONSTRAINT fk_admin_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);
```

### admin_sessions
جلسات لوحة التحكم — إبطال مركزي وتحقق MFA لكل جلسة (FR-ADM-002).

```sql
-- admin_sessions: جلسة إدارية (token hash + mfa_verified + ip) قابلة للإبطال
CREATE TABLE admin_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  token_hash    VARCHAR(255) NOT NULL,
  mfa_verified  BOOLEAN NOT NULL DEFAULT false,
  ip            INET,
  user_agent    VARCHAR(300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  CONSTRAINT uq_admin_sessions_token UNIQUE (token_hash),
  CONSTRAINT fk_as_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_admin_sessions_active ON admin_sessions (admin_user_id) WHERE revoked_at IS NULL;
```

### feature_flags
مفاتيح التشغيل التدريجي — `crypto_enabled / savings_enabled / qr_enabled / network_cards_enabled`… ولا تستبدل Authorization ولا الأمن (Master §50، FR-ADM-038).

```sql
-- feature_flags: مفتاح تشغيل تدريجي (نسبة/مناطق/إصدارات) — تحكم عرض فقط
CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key    VARCHAR(60) NOT NULL,
  description VARCHAR(300),
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  rollout     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID, updated_by UUID,
  CONSTRAINT uq_feature_flags_key UNIQUE (flag_key)
);
```

### system_settings
الإعدادات المركزية — رقم الدعم، ظهور العملات، إعدادات OTP/الأمان، إلخ (Master §97، Remote Configuration للتحكم لا للمنطق المالي — Master §98).

```sql
-- system_settings: key-value JSONB مركزي — مثل support_number وcurrency_visibility
CREATE TABLE system_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(80) NOT NULL,
  value       JSONB NOT NULL,
  description VARCHAR(300),
  status      record_status NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID, updated_by UUID,
  CONSTRAINT uq_system_settings_key UNIQUE (setting_key)
);
```

### system_state
الحالة العالمية للمنظومة — **صف وحيد** يقرأه التطبيق عند كل إقلاع/طلب (Version Check → System Check — Master §51، FR-ADM-041): `READ_ONLY` يوقف الجديد ويسمح بالاطلاع، والتغيير يُدوَّن في `audit_logs`.

```sql
-- system_state: صف وحيد (CHECK id=1) يضبط حالة النظام العالمية
CREATE TABLE system_state (
  id         SMALLINT PRIMARY KEY DEFAULT 1,
  state      system_status NOT NULL DEFAULT 'ACTIVE',
  reason     VARCHAR(300),
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_system_state_singleton CHECK (id = 1)
);
```

### app_versions
إصدارات التطبيق لكل منصة وآلية Force Update — تُقرأ في تسلسل الدخول قبل أي شيء (Master §52، FR-ADM-040).

```sql
-- app_versions: (platform x version_code) فريد مع الحد الأدنى وforce_update
CREATE TABLE app_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     platform_type NOT NULL,
  version_code INTEGER NOT NULL,
  version_name VARCHAR(20) NOT NULL,
  minimum_code INTEGER NOT NULL,           -- أدنى إصدار مقبول
  force_update BOOLEAN NOT NULL DEFAULT false,
  release_notes TEXT,
  store_url    VARCHAR(300),
  status       record_status NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID, updated_by UUID,
  CONSTRAINT uq_app_versions UNIQUE (platform, version_code),
  CONSTRAINT ck_app_platform CHECK (platform IN ('ANDROID','IOS'))
);
```

## 5.9 المجموعة التاسعة — الأمن والتدقيق والتسوية

### نظرة سريعة

| الجدول | الغرض | العلاقات المحورية |
|---|---|---|
| audit_logs | سجل التدقيق الشامل غير القابل للتعديل | مراجع فاعل/هدف متعددة الأشكال |
| security_events | الأحداث الأمنية والإشارات | → users, devices |
| risk_rules | قواعد المخاطر القابلة للإدارة | → risk_events |
| risk_events | قرارات المخاطر ومسار المراجعة | → risk_rules, transactions, admin_users |
| reconciliation_runs | تشغيلات المطابقة الدورية | → reconciliation_items |
| reconciliation_items | بنود المطابقة والانحرافات | → runs, accounts, wallets, adjustments |

### audit_logs
سجل التدقيق — **Append-only للأبد**: الفاعل/الدور/الإجراء/الهدف/قبل/بعد/السبب/الوقت/IP/الجهاز، ويغطي إلزامياً كل الإجراءات الحساسة (تجميد، رسوم، حدود، خدمات، مناطق، إصدارات، محتوى، تسويات، قرارات KYC، أمن) — Master §45، FR-ADM-048/050.

```sql
-- audit_logs: سجل غير قابل للتعديل أو الحذف — الهدف والفاعل متعددا الأشكال (P-05, R-14)
CREATE TABLE audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type  actor_type NOT NULL,
  actor_id    UUID,                     -- مستخدم أو إداري أو Job (مرجع فاعل)
  actor_role  VARCHAR(40),
  action      VARCHAR(80) NOT NULL,     -- freeze_user / fee_change / service_off / ...
  target_type VARCHAR(60) NOT NULL,
  target_id   UUID,
  before_state JSONB,
  after_state  JSONB,
  reason      VARCHAR(500),
  ip          INET,
  device_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_type, actor_id, created_at DESC);
-- الإنفاذ: REVOKE UPDATE, DELETE ON audit_logs FROM app_rw;  (Master §45, FR-ADM-050)
```

### security_events
الأحداث الأمنية — جهاز جديد، محاولات PIN فاشلة، Spoofing/VPN/محاكي/روت، مع **الإشارات التي بُني عليها القرار** (Master §62/§108، FR-GEO-007/008، FR-ADM-035).

```sql
-- security_events: حدث أمني + severity + signals JSONB — يغذي محرك المخاطر والتنبيهات
CREATE TABLE security_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  device_id  UUID,
  event_type VARCHAR(60) NOT NULL,      -- NEW_DEVICE/PIN_FAILED/SPOOFING_SUSPECTED/VPN_DETECTED/...
  severity   VARCHAR(10) NOT NULL DEFAULT 'INFO',
  signals    JSONB NOT NULL DEFAULT '{}',
  ip         INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_se_severity CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  CONSTRAINT fk_se_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_se_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT
);
CREATE INDEX idx_sec_user_time ON security_events (user_id, created_at DESC);
```

### risk_rules
قواعد المخاطر — إشارة → شرط (JSONB) → قرار (`ALLOW/REVIEW/BLOCK`) + أثر (تنبيه/مراجعة/تجميد) بأولوية، قابلة للإدارة من Security Admin (Master §62، FR-ADM-032).

```sql
-- risk_rules: (signal x conditions) → decision + effect — إدارة بلا نشر جديد
CREATE TABLE risk_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(60) NOT NULL,
  signal     VARCHAR(60) NOT NULL,      -- NEW_DEVICE/PIN_FAILURES/VELOCITY/LOCATION_ANOMALY/...
  conditions JSONB NOT NULL,
  decision   risk_decision NOT NULL,
  effect     risk_effect NOT NULL DEFAULT 'ALERT',
  priority   SMALLINT NOT NULL DEFAULT 100,
  status     record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, updated_by UUID,
  CONSTRAINT uq_risk_rules_code UNIQUE (code)
);
```

### risk_events
نتائج تقييم المخاطر لكل عملية حساسة — القرار والإشارات والإجراء المتخذ ومسار المراجعة حتى الإغلاق؛ التجميد الأمني التلقائي يمر من هنا ويفتح حالة مراجعة (Master §63، FR-ADM-033/036).

```sql
-- risk_events: قرار المحرك لكل عملية/مستخدم + مراجعة Security Admin + الإغلاق
CREATE TABLE risk_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID,
  user_id        UUID,
  transaction_id UUID, tx_date DATE,
  decision       risk_decision NOT NULL,
  signals        JSONB NOT NULL DEFAULT '{}',
  action_taken   VARCHAR(60),            -- FREEZE/REVIEW/ALERT/RELEASE
  reviewed_by    UUID,                   -- FK → admin_users (§5.10)
  reviewed_at    TIMESTAMPTZ,
  review_outcome VARCHAR(200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  CONSTRAINT fk_re_rule FOREIGN KEY (rule_id) REFERENCES risk_rules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_re_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_re_transaction FOREIGN KEY (transaction_id, tx_date)
    REFERENCES transactions (id, tx_date) ON DELETE RESTRICT
);
CREATE INDEX idx_risk_events_open ON risk_events (created_at DESC) WHERE resolved_at IS NULL;
```

### reconciliation_runs
تشغيلات المطابقة الدورية (Job) — تطابق مجموع `ledger_entries` مع مجموع أرصدة `wallet_balances`، وأي انحراف يولّد `RECONCILIATION_ALERT` دون أي حذف بيانات (Master §76/§44، FR-LDG-010، AC-10).

```sql
-- reconciliation_runs: تشغيلة مطابقة (DAILY/INTRADAY/AGENT/PROVIDER) بإجماليات ومقارنة
CREATE TABLE reconciliation_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type              VARCHAR(40) NOT NULL DEFAULT 'DAILY',
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  status                reconciliation_status NOT NULL DEFAULT 'RUNNING',
  ledger_debit_total    NUMERIC(21,4),
  ledger_credit_total   NUMERIC(21,4),
  derived_balance_total NUMERIC(21,4),     -- الرصيد المتوقع من الدفتر
  wallet_balance_total  NUMERIC(21,4),     -- مجموع أرصدة المحافظ
  variance              NUMERIC(21,4),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ,
  triggered_by          UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_run_period CHECK (period_end >= period_start)
);
```

### reconciliation_items
بنود المطابقة لكل حساب/محفظة — الانحراف يُحل بـ `adjustment_requests` موثّقة، **لا يُحل بحذف البيانات** (Master §44/§90).

```sql
-- reconciliation_items: بند (متوقع/فعلي/فرق/النتيجة) + حل عبر Adjustment
CREATE TABLE reconciliation_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               UUID NOT NULL,
  account_id           UUID,
  wallet_id            UUID,
  currency_code        CHAR(3),
  expected_amount      NUMERIC(18,4) NOT NULL,
  actual_amount        NUMERIC(18,4) NOT NULL,
  variance             NUMERIC(18,4) NOT NULL DEFAULT 0,
  result               reconciliation_result NOT NULL,
  details              JSONB,
  adjustment_request_id UUID,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ri_variance CHECK (variance = actual_amount - expected_amount),
  CONSTRAINT fk_ri_run FOREIGN KEY (run_id) REFERENCES reconciliation_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ri_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ri_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ri_adjustment FOREIGN KEY (adjustment_request_id)
    REFERENCES adjustment_requests(id) ON DELETE RESTRICT
);
CREATE INDEX idx_ri_variance ON reconciliation_items (run_id, result);
```

## 5.10 قيود مرجعية عبر المجموعات (ALTER TABLE)

القيود التالية تربط مجموعات متباعدة بترتيب إنشاء صحيح (تمثيل الترتيب الفعلي في Migrations):

```sql
-- D1 → D2: انتماء المستخدم الجغرافي
ALTER TABLE users ADD CONSTRAINT fk_users_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT;
ALTER TABLE users ADD CONSTRAINT fk_users_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT;

-- D3 → D5: ملكية حسابات Float والتسويات في دليل الحسابات
ALTER TABLE ledger_accounts ADD CONSTRAINT fk_lacc_agent FOREIGN KEY (owner_agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
ALTER TABLE ledger_accounts ADD CONSTRAINT fk_lacc_merchant FOREIGN KEY (owner_merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT;

-- D3 → D4: كل قيد دفتر ينتمي لمعاملة (مفتاح مركب بسبب التقسيم)
ALTER TABLE ledger_entries ADD CONSTRAINT fk_le_transaction FOREIGN KEY (transaction_id, tx_date)
  REFERENCES transactions (id, tx_date) ON DELETE RESTRICT;

-- D4 → D5: أطراف المعاملة من الوكلاء والتجار + ربط العكس بالأصل
ALTER TABLE transactions ADD CONSTRAINT fk_tx_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT fk_tx_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT fk_tx_terminal FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT fk_tx_reversal FOREIGN KEY (reversal_of_reference)
  REFERENCES transaction_references(reference) ON DELETE RESTRICT;

-- D4 → D5: الوكلاء في الطلبات والتسليم
ALTER TABLE deposit_requests ADD CONSTRAINT fk_dep_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
ALTER TABLE withdrawal_requests ADD CONSTRAINT fk_wd_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
ALTER TABLE remittance_orders ADD CONSTRAINT fk_rem_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
ALTER TABLE remittance_deliveries ADD CONSTRAINT fk_rd_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;

-- D4 → D5: أطراف الدفع للتاجر
ALTER TABLE payments ADD CONSTRAINT fk_pay_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_pay_branch FOREIGN KEY (branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_pay_terminal FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_pay_qr FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE RESTRICT;

-- D1/D4/D7/D9 → D8: مراجع المدققين والموافقين والمسؤولين الإداريين
ALTER TABLE kyc_profiles ADD CONSTRAINT fk_kyc_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE support_tickets ADD CONSTRAINT fk_ticket_admin FOREIGN KEY (assigned_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE adjustment_requests ADD CONSTRAINT fk_adj_requester FOREIGN KEY (requested_by) REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE adjustment_requests ADD CONSTRAINT fk_adj_approver FOREIGN KEY (approved_by) REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE risk_events ADD CONSTRAINT fk_re_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE RESTRICT;
```

---

# 6. آلات الحالة كقيود

كل آلة حالة من ملحق أ (SRS) أصبحت نوع ENUM في القاعدة (القيم المسموحة محصورة نحوياً)، أما **الانتقالات المسموحة فتُفرض في طبقة التطبيق** (محرك المعاملات) — لأن PostgreSQL لا يدعم قيود انتقال State Machine أصلية — مع تدوين **كل انتقال** في `transaction_status_history` و/أو `audit_logs` (P-09، Master §17):

| الكيان | الحقل | القيم المسموحة (ENUM) | الانتقالات المسموحة |
|---|---|---|---|
| users | account_status | PENDING, ACTIVE, RESTRICTED, FROZEN, SUSPENDED, CLOSED | PENDING→ACTIVE؛ ACTIVE⇄RESTRICTED⇄FROZEN؛ (ACTIVE/RESTRICTED/FROZEN)→SUSPENDED→CLOSED؛ لا عودة من CLOSED |
| kyc_profiles | status | NOT_STARTED, PENDING, UNDER_REVIEW, APPROVED, REJECTED, EXPIRED, REQUIRES_UPDATE | NOT_STARTED→PENDING→UNDER_REVIEW→(APPROVED/REJECTED/REQUIRES_UPDATE)؛ APPROVED→EXPIRED؛ REJECTED/REQUIRES_UPDATE→PENDING (إعادة تقديم) |
| transactions | status | CREATED, VALIDATING, AUTHORIZED, PROCESSING, COMPLETED, FAILED, REJECTED, CANCELLED, EXPIRED, REVERSED, UNDER_REVIEW | CREATED→VALIDATING→AUTHORIZED→PROCESSING→COMPLETED؛ أي حالة نشطة→(FAILED/REJECTED/CANCELLED/EXPIRED/UNDER_REVIEW)؛ COMPLETED→REVERSED فقط |
| withdrawal_requests | status | CREATED, PENDING, AUTHORIZED, READY_FOR_COLLECTION, COLLECTED, COMPLETED, REJECTED, EXPIRED, CANCELLED, REVERSED | CREATED→PENDING→AUTHORIZED→READY_FOR_COLLECTION→COLLECTED→COMPLETED؛ AUTHORIZED/READY_FOR_COLLECTION→(EXPIRED→REVERSED)؛ (PENDING/AUTHORIZED)→(CANCELLED/REJECTED) |
| deposit_requests | status | CREATED, PENDING, CONFIRMED, COMPLETED, REJECTED, EXPIRED, CANCELLED | CREATED→PENDING→CONFIRMED→COMPLETED؛ PENDING→(REJECTED/EXPIRED/CANCELLED) |
| remittance_orders | status | CREATED, PENDING_DELIVERY, DELIVERED, COMPLETED, EXPIRED, CANCELLED, REVERSED | CREATED→PENDING_DELIVERY→DELIVERED→COMPLETED؛ PENDING_DELIVERY→(CANCELLED/EXPIRED→REVERSED) |
| users (المحسوبة) | eligibility_status | ELIGIBLE, PENDING_REVIEW, RESTRICTED, OUTSIDE_SERVICE_AREA, BLOCKED | تقييم متعدد الإشارات عند كل عملية/دخول؛ كل تغيير يُدوَّن في audit_logs (FR-GEO-014) |
| services / networks / bill_providers | status | ON, OFF, MAINTENANCE | ON⇄OFF⇄MAINTENANCE بحرية إدارية + Audit إلزامي |
| system_state | state | ACTIVE, MAINTENANCE, READ_ONLY, SERVICE_DEGRADED, BLOCKED | ACTIVE⇄(MAINTENANCE/READ_ONLY/SERVICE_DEGRADED)؛ أي حالة→BLOCKED (طوارئ) |
| agents | status | ACTIVE, SUSPENDED, BLOCKED | ACTIVE⇄SUSPENDED→BLOCKED (لا حذف) |
| merchants | status | PENDING, ACTIVE, SUSPENDED, BLOCKED, CLOSED | PENDING→ACTIVE⇄SUSPENDED→BLOCKED/CLOSED |
| support_tickets | status | OPEN, IN_PROGRESS, WAITING_USER, RESOLVED, CLOSED | OPEN→IN_PROGRESS⇄WAITING_USER→RESOLVED→CLOSED (لا إعادة فتح؛ تذكرة جديدة) |
| devices | device_status | PENDING, TRUSTED, UNTRUSTED, BLOCKED | PENDING→(TRUSTED/UNTRUSTED)⇄؛ أي حالة→BLOCKED |
| adjustment_requests | status | PENDING, APPROVED, REJECTED, EXECUTED, CANCELLED | PENDING→(APPROVED→EXECUTED / REJECTED / CANCELLED)؛ لا تعديل بعد EXECUTED |
| network_cards | status | IN_STOCK, RESERVED, SOLD, DISABLED | IN_STOCK⇄RESERVED→SOLD؛ RESERVED→IN_STOCK عند فشل الدفع؛ أي حالة→DISABLED |

> **قاعدة إلزامية:** أي انتقال حالة مالية يُنفَّذ داخل نفس معاملة قاعدة البيانات التي تكتب قيود Ledger والقيود ذات الصلة، ويُدرج صف في `transaction_status_history` — انتقال غير مدوَّن = خلل تدقيق يكشفه Reconciliation/المراجعة.

---

# 7. الفهارس واستراتيجية الأداء

## 7.1 أهم الفهارس (المعرّفة داخل كتل DDL أعلاه — الخلاصة)

| # | الجدول | الفهرس | النوع | الغرض |
|---|---|---|---|---|
| 1 | users | uq_users_phone | UNIQUE | رقم واحد = حساب واحد (FR-GEO-011) + الدخول بالهاتف |
| 2 | users | idx_users_type_status | مركّب | لوحة المعلومات وتصفية الإدارة |
| 3 | users | idx_users_region | مركّب | تقارير المناطق والخريطة الساخنة (FR-GEO-015) |
| 4 | transactions | idx_tx_status_date (status, created_at) | مركّب | قوائم الإدارة: معلّق/فاشل اليوم (Master §105) |
| 5 | transactions | idx_tx_user_date (user_id, tx_date DESC) | مركّب | سجل عمليات المستخدم مع Pagination (FR-STM-003) |
| 6 | transactions | idx_tx_reference | B-tree | البحث بالمرجع داخل القسم (FR-STM-006) |
| 7 | transaction_references | reference (PK) | UNIQUE | **التفرد العالمي** للمرجع عبر الأقسام + البحث المركزي |
| 8 | ledger_entries | idx_le_account_date (account_id, tx_date) | مركّب | كشف حساب الحساب/المحفظة زمنياً (running_balance) |
| 9 | ledger_entries | idx_le_transaction | B-tree | جمع قيود المعاملة (فحص توازن المدين/الدائن) |
| 10 | wallet_balances | uq_wallet_balances (wallet_id, currency_code) | UNIQUE | نقطة القفل والتحديث لكل عملية مالية |
| 11 | idempotency_keys | uq_idem (idem_key, endpoint) | UNIQUE | منع التنفيذ المزدوج (P-04، AC-03) |
| 12 | idempotency_keys | idx_idem_user | مركّب | تنظيف المفاتيح المنتهية |
| 13 | otp_codes | idx_otp_phone_created | مركّب | التحقق السريع وحد الإرسال اليومي (FR-AUTH-002) |
| 14 | devices | uq_devices_user_fp | UNIQUE | بصمة جهاز واحدة لكل مستخدم (FR-GEO-010) |
| 15 | sessions | idx_sessions_user_active | جزئي | الجلسات النشطة للمستخدم/الإدارة |
| 16 | withdrawal_requests | idx_wd_expiry | جزئي | Job تحرير Holds المنتهية (FR-CWD-003) |
| 17 | remittance_orders | idx_rem_status_expiry | مركّب | ملاحقة الحوالات وانتهاء مهلها (FR-REM-008) |
| 18 | payments | idx_pay_merchant | مركّب | مدفوعات/مبيعات التاجر وتسوياته |
| 19 | qr_codes | idx_qr_terminal_active | مركّب | حلّ QR إلى نقطة بيع مفعلة (FR-PAY-001) |
| 20 | network_cards | uq_network_cards_serial + idx_nc_available | UNIQUE + مركّب | المخزون والكرت المتاح للبيع |
| 21 | topups | idx_topups_network | مركّب | أداء المزودين وتقاريرهم (FR-ADM-045) |
| 22 | notifications | idx_notif_unread | جزئي | مركز الإشعارات: غير المقروء فقط |
| 23 | support_tickets | idx_tickets_status | مركّب | طابور الدعم بالأولوية والحالة |
| 24 | audit_logs | idx_audit_target / idx_audit_actor | مركّب | تتبع كل إجراء على كيان/فاعل (Auditor) |
| 25 | security_events | idx_sec_user_time | مركّب | سجل الأمن لكل مستخدم |
| 26 | risk_events | idx_risk_events_open | جزئي | الحالات المشبوهة غير المحلولة (FR-ADM-033) |
| 27 | transactions | idx_tx_metadata | GIN (jsonb_path_ops) | البحث في لقطة الـmetadata (القسم 74) |
| 28 | agent_float_accounts | idx_af_low | جزئي | تنبيهات نضوب Float (RK-05) |

## 7.2 التقسيم الشهري (Declarative Partitioning)

`transactions` و`ledger_entries` مقسّمان بـ `RANGE(tx_date)` — الجدولان الأسرع نمواً (القسم 121: بيئة محدودة السعة). Job مجدول (pg_cron أو Background Job في الخادم) ينشئ قسم الشهر التالي قبل بدايته، وقسم DEFAULT يلتقط أي تاريخ شاذ مع تنبيه:

```sql
-- إنشاء أقسام شهرية (مثال لشهر واحد — تتكرر آلياً كل شهر)
CREATE TABLE transactions_2026_09 PARTITION OF transactions
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE ledger_entries_2026_09 PARTITION OF ledger_entries
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- قسم DEFAULT يمنع فشل الإدراج خارج الأقسام (يُراقب ويُنبَّه عند استخدامه)
CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;
CREATE TABLE ledger_entries_default PARTITION OF ledger_entries DEFAULT;
```

ملاحظات التقسيم:

- **الفهارس تُنشأ على الجدول الأب** فتتوراث تلقائياً لكل قسم جديد (Partitioned Indexes).
- **القيود الفريدة** على جدول مقسّم يجب أن تتضمن مفتاح القسم — لذلك التفرد العالمي للمرجع ينفذه `transaction_references` (جدول غير مقسّم) داخل نفس المعاملة، وهو ما يجعل `transactions`+`transaction_references` زوجاً واحداً منطقياً (القرار M-02).
- كل جدول مرتبط بـ `transactions` يحمل `(transaction_id, tx_date)` بمفتاح أجنبي مركب — `tx_date` يخدم أيضاً مبدأ اللقطة (القسم 74) لأنه تاريخ العملية المحفوظ عند الطرف المرتبط.

## 7.3 سياسة الأرشفة (القسم 121)

- **لا حذف مالي إطلاقاً** لأي صف في `transactions / ledger_entries / transaction_items / transaction_status_history / audit_logs` (R-14، Master §90).
- تخفيض التكلفة يتم بـ: ضغط مستندات KYC وحدود أحجام الملفات، Pagination إلزامي، وأرشفة **التقارير المجمّعة فقط** (Aggregate Snapshots) في مخزن أرخص.
- الأقسام الشهرية القديمة (> 24 شهراً) قد تُنقل إلى Tablespace أرشد على القرص (`ALTER TABLE ... SET TABLESPACE archive_ts`) مع بقائها متاحة للاستعلام والتدقيق — دون DETACH يفقد القيود المرجعية.
- تنظيف دوري للجداول القابلة للانتهاء طبيعياً فقط: `otp_codes` المنتهية، `idempotency_keys` المنتهية، `sessions` المنتهية — بـ DELETE ضمن Job موثق (هذه ليست بيانات مالية).

## 7.4 إنفاذ Append-only على مستوى الصلاحيات

```sql
-- دور التطبيق لا يملك تعديل أو حذف السجلات المالية وسجلات التدقيق (P-05)
REVOKE UPDATE, DELETE ON transactions, transaction_items, transaction_status_history,
  ledger_entries, audit_logs FROM app_rw;
-- الإداريون يقرؤون فقط؛ التصحيح الوحيد = INSERT معاملة REVERSAL مرتبطة بالأصل
```

---

# 8. سياسات البيانات والامتثال

## 8.1 تشفير الحقول الحساسة

| البيانات | السياسة | المرجع |
|---|---|---|
| PIN المستخدم | `users.pin_hash` — argon2/bcrypt فقط؛ لا نص صريح في أي طبقة ولا تخزين محلي | FR-AUTH-015، NFR-SEC-002 |
| رموز OTP | `otp_codes.code_hash` — هاش، وتنتهي صلاحيتها؛ لا تخزين صريح | P-15 |
| رمز السحب / رمز تسليم الحوالة | `withdrawal_code_hash / delivery_code_hash` — هاش، استهلاك مرة واحدة | FR-CWD-002، FR-REM-002 |
| كود كرت الشبكة | `network_cards.code_encrypted` — BYTEA مشفّر بمفتاح KMS خارج القاعدة | Master §35 |
| مستندات KYC | `kyc_documents.storage_key` فقط — الملف في Storage موقّع (Signed Access مؤقت) ولا يُعرض إلا لمدقق KYC المصرّح | Master §122، FR-KYC-006 |
| سر MFA الإداري | `admin_users.mfa_secret_enc` — مشفّر خارجياً | FR-ADM-002 |
| أسرار المزودين | خارج القاعدة تماماً (Vault) — لا API Secrets في القاعدة أو التطبيق | R-07، Master §81 |

## 8.2 الاحتفاظ والتدقيق

- `audit_logs` وكل السجلات المالية: **لا حذف ولا تعديل أبداً** وللمدد النظامية المطلوبة حتى بعد إغلاق الحساب (NFR-CMP-004، Master §90).
- عزل السجلات الثلاثة (Master §83): Application Logs خارج القاعدة، Security Logs = `security_events`، Financial Audit = `audit_logs` + `ledger_entries` — وبلا أسرار داخل أي منها (Master §81).
- كل تقرير **Read-Only** ولا يغير الأرصدة (Master §77، FR-ADM-047).

## 8.3 حذف/إغلاق الحساب (Master §91)

إغلاق الحساب ≠ حذف السجلات: تصفية الرصيد أولاً (رفض الإغلاق مع رصيد قائم — AC-11) ثم `users.account_status = CLOSED` + إنهاء الجلسات + **إخفاء البيانات الشخصية** (`profiles` يُفرَّغ من الاسم/العنوان و`users.anonymized_at` يُضبط) مع بقاء كل الصفوف المالية المرجعية (FK RESTRICT يضمنها بنيوياً).

## 8.4 النسخ الاحتياطي والاستعادة (Master §123، NFR-REL-002/005)

- نسخ يومي كامل + WAL مستمر (Point-In-Time Recovery) — الهدف RPO ≤ 15 دقيقة / RTO ≤ 4 ساعات.
- **اختبار Restore دوري فعلي** في بيئة معزولة (لا نسخ بلا استعادة تجريبية) مع تحقق عدد الصفوف وتوازن Ledger بعد الاستعادة.
- خطة Disaster Recovery لكل حالة فشل (قاعدة/مزود/تطبيق/شبكة/اختراق إداري/ازدواج معاملة) — Master §124.

---

# 9. قرارات نمذجة مهمة

| # | القرار | المبرر |
|---|---|---|
| M-01 | أرصدة `wallet_balances` تحمل `available/pending/frozen` مع `version` و**قفل صف `SELECT FOR UPDATE`** أثناء أي معاملة | Master §12 (الرصيد المنطقي ثلاثي الأجزاء) + منع التعديل المتزامن (FR-WLT-008) |
| M-02 | تقسيم `transactions/ledger_entries` شهرياً بمفتاح `(id, tx_date)` + جدول `transaction_references` غير مقسّم للتفرد العالمي للمرجع | القسم 121 (السعة) + قيد PostgreSQL: الفريد على المقسّم يتضمن مفتاح القسم؛ الجدول المرجعي يضمن التفرد عبر الأقسام داخل نفس TX |
| M-03 | لقطة الرسوم داخل المعاملة: `fee_rule_id + fee_rule_version + fee_amount` | Master §37: تغيير الإدارة للرسوم لا يغيّر المعاملات القديمة (AC-05) |
| M-04 | `transactions.metadata` JSONB يحمل لقطة كاملة (القسم 74) — لا تفسير تاريخي ببيانات حالية متغيرة | Master §74 |
| M-05 | Double-Entry على `ledger_accounts` بدليل حسابات واحد يضم: محافظ المستخدمين، الحصالة، الرسوم، Float الوكلاء، عمولاتهم، تسوية التجار، Suspense المزودين، Treasury | Master §14: كل تغيير فعلي في الأموال = قيدان+؛ التحقق الدوري Reconciliation (القسم 76) |
| M-06 | `agent_float_accounts` = رابط تشغيلي لكل (وكيل×عملة) نحو حساب `AGENT_FLOAT` + كاش `current_balance` يُحدَّث داخل نفس TX | الرصيد الحقيقي في Ledger (مصدر الحقيقة)، والكاش يخدم شاشة التشغيل ويطابقه Reconciliation (Master §100) |
| M-07 | `savings_accounts` مرتبطة 1-1 بحساب `SAVINGS` — الحصالة محفظة داخلية حقيقية وليست رقماً وهمياً | Master §31، FR-SAV-002 |
| M-08 | عمولة الوكيل تُثبَّت كبند `AGENT_COMMISSION` في `transaction_items` لكل معاملة | Master §101: العمولة تسجل داخل المعاملة فلا تتأثر العمليات القديمة |
| M-09 | `admin_users` منفصلون كلياً عن `users` مع `admin_sessions` خاصة | عزل سطح الهجوم: حسابات التطبيق لا تمنح أي مسار إداري؛ MFA إلزامي وقيود IP (Master §78) |
| M-10 | `reversal_of_reference` في `transactions` يربط المعاملة العكسية بمرجع الأصل عبر FK إلى `transaction_references` | تجنب Self-FK على جدول مقسّم + ربط موثق للتصحيح (Master §75) |
| M-11 | `running_balance` في `ledger_entries` لكل حساب | كشف حساب المستخدم (Date/Type/Reference/Before/After — Master §59) دون حساب تجميعي مكلف |
| M-12 | `created_by/updated_by` مراجع فاعل بلا FK صلب (مستخدم/إداري/Job) | تعدد أشكال الفاعل؛ الفاعل الحقيقي يُحفظ في `audit_logs` (Master §89 يكفي بوجود العمود) |
| M-13 | `notifications.transaction_reference` ربط ناعم بالمرجع (نص) دون FK إلى الجدول المقسّم | الإشعارات كيان إبلاغ (R-13) لا يبرر تكلفة مفتاح مركب، والمرجع فريد عالمياً |
| M-14 | Soft delete (`deleted_at`) في content/banners/faqs/notifications فقط | Master §90: المحتوى يُخفى/يؤرشف؛ المالي والتدقيق لا يُحذف |
| M-15 | `system_state` صف وحيد بـ `CHECK (id=1)` + `services.status` لكل خدمة | Master §49/§51: حالة النظام حالة عالمية وحيدة، وحالة الخدمة لكل خدمة على حدة |
| M-16 | جدول `services` كسجل موحد لكل خدمة (فئة/مزود/حقول/تسعير/سير عمل) | Master §33: لا شاشات مستقلة بلا بنية؛ الحالة تُقرأ عند كل طلب جديد |

---

# 10. الخاتمة والموافقة

## 10.1 الملخص

هذا المخطط يغطي **78 جدولاً في 9 مجموعات، 45 نوع ENUM، و98 علاقة مُوثّقة**، ويحقق حرفياً قائمة الكيانات الإلزامية في القسم 71 من Master PLAN (56 كياناً — التغطية كاملة بلا استثناء) إضافة إلى الكيانات المشتقة من SRS (otp_codes, idempotency_keys, remittance_orders/deliveries, favorites, exchange_rates, agent_float_accounts, agent_commission_rules, agent_daily_settlements, merchant_settlements, network_cards + sales, push_tokens, admin_users + admin_sessions, provider_webhook_events, adjustment_requests, risk_rules + risk_events) و`services` و`transaction_references` و`system_state` بمبرر Master §33/§73/§51. كل قاعدة جوهرية (R-01..R-14) لها تجسيد بنيوي مباشر: Ledger Append-only مع Double-Entry، Idempotency بقيود فريدة، لا مسار لتعديل رصيد خارج Adjustment موثق، حذف منطقي للمحتوى فقط، وتقسيم شهري مع سياسة أرشفة بلا أي حذف مالي.

> **الخطوة التالية المقترحة:** اعتماد هذه الوثيقة ثم اشتقاق وثيقة المعمارية (API/Modules) وترتيب Migrations الأولي (ENUMs → D2 → D1 → D8 → D3 → D5 → D4 → D6 → D7 → D9 → §5.10) مع بيانات Seed للمحافظات الثماني والعملات والأدوار السبعة.

## 10.2 الموافقة

| الدور | الاسم | التوقيع | التاريخ |
|---|---|---|---|
| صاحب المنتج | | | |
| المعماري | | | |
| مهندس قاعدة البيانات | | | |
| الامتثال والمخاطر | | | |
