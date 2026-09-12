# عقد بناء MVP — محفظة الجنوب (المرحلة 1: Alpha الداخلي)

> هذه الوثيقة **ملزمة** لكل وكلاء البناء (8-a / 8-b / 8-c / 8-d). أي تعارض بينها وبين وثائق docs/ الأقدم → هذه الوثيقة أسلم في نطاق المرحلة 1.
> المرجعية: docs/SRS.md (المرجع التعاقدي)، docs/SCREENS_FLOWS.md (الشاشات ونظام التصميم §2)، docs/API_ENDPOINTS.md (الاصطلاحات المفاهيمية).

## 0. القرارات المحسومة (اعتماد صاحب المنتج: "أوافق على كل شيء")

| القرار | الحسم |
|---|---|
| D-01 نمط Alpha | **نظام نقدي مغلق تجريبي**: كل الأرصدة والنقد في Seed — بلا تكاملات خارجية |
| D-02 ترتيب الدفع/التاجر | خدمات المرحلة 2 (فواتير/شحن/كروت/دفع تاجر/حوالة واردة) = **COMING_LATER** ظاهرة عبر ServiceState |
| FR-CRY | خارج النطاق كلياً |
| D-05 التوسع | 8 محافظات جنوبية فقط (القائمة في api-types) |
| مزودو SMS/OTP | وضع تجريبي: يُعاد الرمز في الاستجابة `devCode` ويعرض في واجهة Alpha |

## 1. البنية التنفيذية في هذه البيئة

- **Frontend**: Next.js 16 App Router — صفحة واحدة `/` تعمل كتطبيق SPA (توجيه شاشات كامل بstate داخل المتصفح — بلا مسارات صفحات أخرى).
- **Backend**: Route Handlers تحت `/api/*` + Prisma (SQLite موجود بدفع المخطط) — العقد كامل أدناه.
- **الوصول**: كل مسار API يتحقق من الجلسة (كوكي `sw_session` httpOnly) والدور.
- كل الكود TypeScript صارم، `'use client'` حيث يلزم، لا `any` في الملفات الجديدة إلا لمخرجات JSON الخام المعروفة النمط.

## 2. الاصطلاحات (ملزمة)

1. **الغلاف الموحد** لكل استجابة: نجاح `{ "ok": true, "data": ... }` / فشل `{ "ok": false, "error": { "code", "message", "details" } }`.
2. **أكواد الأخطاء** كما في `src/lib/api-types.ts` (`ERROR_MESSAGES`) — الخادم يرسل code+message، الواجهة تعرض الرسالة.
3. **الجلسة**: `sw_session` (httpOnly, sameSite=lax, 7 أيام) — `getSessionUser()` في `src/lib/server/auth.ts`.
4. **Idempotency**: رأس `Idempotency-Key` في كل POST مالي (تحويل/حوالة/سحب/صرف/حصالة). الخادم يخزنه مع العملية: نفس المفتاح+نفس المستخدم → إعادة نفس الاستجابة 200 مع `details.replayed=true`؛ نفس المفتاح وحمولة مختلفة → `TXN-003` (AC-03).
5. **PIN**: 6 أرقام، scrypt (`src/lib/server/pin.ts`) — يُرسل في جسم الطلبات المالية، يُتحقق قبل أي خصم، قفل تصاعدي (3 محاولات → 5 دقائق، 6 → 30 دقيقة) = PIN-002.
6. **المبالغ**: دائماً `xxxMinor: number` (Int) + `currency: "YER"|"SAR"|"USD"` — التنسيق فقط في الواجهة عبر `formatMoney`.
7. **المراجع**: `SW-YYYYMMDD-XXXXXXXX` (تحويل)، `RM-…` (حوالة)، `CW-…` (نقدي)، `TK-…` (تذكرة) — مولّد مركزي في `src/lib/server/domain.ts`.
8. **التدقيق**: كل إجراء إداري حساس (تجميد/قرار KYC/تحرير حد/رسوم/صرف/خدمة/إلغاء) يكتب AuditLog بالسبب — ولا يوجد أي مسار "تعديل رصيد" مباشر (R-05).
9. **الدفع الهرمي للاستجابة المالية**: Quote → مراجعة → PIN → تنفيذ (مرة واحدة).
10. **AC-07 (خارج النطاق)**: `User.scopeRestricted=true` → دخول واطلاع فقط؛ أي POST مالي → `GEO-001` + إشعار + AuditLog.

## 3. حدود Alpha (مقصودة)

- عمليات الوكلاء النقدية **بYER فقط** (عوم الوكيل بYER).
- الحوالة: إرسال + إلغاء + انتهاء صلاحية (7 أيام كسولاً عند القراءة) + دفع لدى أي وكيل بالرمز. لا شبكة صرافة.
- QR: توليد (بياناتي `SWPAY:<phone>`) عبر `GET /api/qr?text=` (SVG)؛ "المسح" بالمحاكاة/BarcodeDetector إن توفر + إدخال يدوي.
- لا: مزود SMS حقيقي، لا: كاميرا إلزامية، لا: تقارير PDF (كشف نصي/CSV من الواجهة).

## 4. الحسابات التجريبية (Seed — يتولها 8-a)

| الهاتف | الدور | ملاحظات |
|---|---|---|
| 770000001 | CUSTOMER أحمد السُّقطري | VERIFIED، عدن، أرصدة YER 250,000 / SAR 850 / USD 300، سجل عمليات غني، PIN=123456 |
| 770000002 | CUSTOMER فاطمة العريقي | NONE، لحج، أرصدة صفرية تقريباً، بدون سجل — لتجربة KYC كاملة |
| 770000003 | CUSTOMER سامي الحضرمي | **scopeRestricted** (صنعاء) — لسيناريو AC-07، PIN=123456 |
| 770000010 | AGENT وكيل النور (صالح البعداني) | عدن/خور مكسر، عوم 2,000,000 YER، عمولة 0.5% |
| 770000011 | AGENT وكيل الأمانة (حسان العمري) | عدن/المنصورة، عوم 1,500,000 YER |
| 770100001 | ADMIN مدير النظام | كامل الصلاحيات |
| 770100002 | COMPLIANCE مراجع KYC | طابور KYC + المستخدمون (قراءة) + التدقيق |
| 770100003 | SUPPORT دعم العملاء | التذاكر فقط |
| SYSTEM | حساب النظام | محافظ FEE/SUSPENSE/FX (لن يُسجل دخوله) |

+ عميلان إضافيان بعمليات متبادلة مع 770000001 لسجل واقعي (770000004 محمد — VERIFIED أبين، 770000005 نورة — VERIFIED حضرموت).
+ بيانات أولية: LimitRule (NONE/VERIFIED × 3 عملات)، FeeRule (TRANSFER/REMITTANCE/WITHDRAW/FX × 3)، FxRate (6 اتجاهات)، ServiceState (BILLS/TOPUP/NETWORK_CARDS/MERCHANT_PAY/REMITTANCE_IN = COMING_LATER، OFFLINE=OFF)، تذكرة+رسائل نموذجية، إشعارات، حصالة نموذجية لأحمد، مفضلان لأحمد.

قيم Seed التفصيلية (رسوم/حدود/صرف) كما في `prisma/seed.ts` — 8-a يكتبها ويشغّلها (`bunx tsx prisma/seed.ts` أو `bun prisma/seed.ts` مع tsx إن لزم؛ الهدف: قاعدة مليئة تعمل).

## 5. عقد نقاط النهاية (كامل — ملزم للطرفين)

> الأنواع في `src/lib/api-types.ts`. «(جلسة)» = يتطلب كوكي جلسة. «(دور)» = يتطلب الدور المذكور. كل POST جسده JSON.

### 5.1 المصادقة
| # | الطريقة والمسار | الوصف |
|---|---|---|
| A1 | POST /api/auth/otp `{ phone }` | يولد OTP — يعيد `{ mode:"REGISTER"\|"LOGIN", devCode, expiresInSeconds }`. فترات: إعادة إرسال ≥60s (AUTH-004)، صلاحية 5 دقائق، 5 محاولات |
| A2 | POST /api/auth/verify `{ phone, code }` | يسجل الدخول/ينشئ حساباً → كوكي جلسة — يعيد `{ user, needsPin }`. حساب مجمّد → دخول اطلاع فقط (AUTH-005 تُعاد كdetails لا كفشل) |
| A3 | POST /api/auth/demo-login `{ phone }` | دخول سريع لحساب Seed (تجريبي فقط) — نفس مخرجات A2 |
| A4 | POST /api/auth/logout | يبطل الجلسة |
| A5 | GET /api/me | يعيد `MeView` (user+wallets+kyc+limits+unread+scopeNotice) |
| A6 | POST /api/pin `{ pin }` | تعيين PIN لأول مرة (يتطلب جلسة بلا pinHash) |
| A7 | PUT /api/pin `{ currentPin, newPin }` | تغيير PIN |
| A8 | POST /api/pin/verify `{ pin }` | تحقق قبل عملية حساسة (يصفّر العداد عند النجاح) |
| A9 | PUT /api/me/biometric `{ enabled }` | تبديل البصمة (تجريبي) |

### 5.2 KYC والملف
| # | الطريقة والمسار | الوصف |
|---|---|---|
| K1 | GET /api/kyc | آخر طلب توثيق أو null |
| K2 | POST /api/kyc `{ fullName, idType, idNumber, governorate, address?, occupation?, monthlyIncomeMinor?, docName?, selfieName? }` | إرسال طلب (KYC-002 لو قائم) + إشعار |
| P1 | GET /api/profile | `{ user: PublicUser, sessions: [...] }` للأجهزة/الجلسات |
| P2 | DELETE /api/profile/sessions/:id | إنهاء جلسة أخرى (SECURITY) |

### 5.3 المحفظة والصرف
| # | الطريقة والمسار | الوصف |
|---|---|---|
| W1 | GET /api/wallets | `WalletView[]` (MAIN فقط) |
| W2 | GET /api/fx | `FxRateView[]` |
| W3 | POST /api/wallet/exchange-quote `{ fromCurrency, toCurrency, amountMinor }` | `ExchangeQuoteView` |
| W4 | POST /api/wallet/exchange `{ fromCurrency, toCurrency, amountMinor, pin }` + Idempotency-Key | ينفذ التحويل بين محافظ المستخدم → `TxView` (FX_EXCHANGE) |

### 5.4 التحويلات
| # | الطريقة والمسار | الوصف |
|---|---|---|
| T1 | POST /api/transfers/quote `{ phone, currency, amountMinor }` | `TransferQuoteView` — TRF-001 إن لم يسجل، TRF-002 لنفسه |
| T2 | POST /api/transfers `{ phone, currency, amountMinor, note?, pin }` + Idempotency-Key | ينفذ (TXN-001/TXN-002/GEO-001/ACC-001) → `TxView` + إشعار للطرفين + رصيد محدث في details |
| T3 | GET /api/transactions `?cursor&limit&types&status&currency` | `PageView<TxView>` (حد 20) |
| T4 | GET /api/transactions/:ref | `TxView` + `details.ledger` مصغر (4 قيود) للعرض |
| T5 | GET /api/statement `?from&to&currency` | `{ summary:{count,totalInMinor,totalOutMinor,feesMinor}, items:TxView[] }` |

### 5.5 المفضلون
| # | الطريقة والمسار | الوصف |
|---|---|---|
| F1 | GET /api/beneficiaries | `BeneficiaryView[]` |
| F2 | POST /api/beneficiaries `{ name, phone }` | إضافة (تتحقق أن الهاتف مستخدم) |
| F3 | DELETE /api/beneficiaries/:id | حذف |

### 5.6 الحوالات
| # | الطريقة والمسار | الوصف |
|---|---|---|
| R1 | POST /api/remittances/quote `{ currency, amountMinor }` | `{ feeMinor, totalMinor }` |
| R2 | POST /api/remittances `{ receiverName, receiverPhone, currency, amountMinor, pin }` + Idempotency-Key | → `RemittanceView` مع `deliveryCode` (يُعرض للمرسل مرة عند الإنشاء + في التفاصيل) |
| R3 | GET /api/remittances | `RemittanceView[]` (مع الإنهاء الكسول: PENDING منتهي → EXPIRED + استرجاع) |
| R4 | POST /api/remittances/:id/cancel `{ pin }` | إلغاء واسترجاع (REM-001) |

### 5.7 النقدي والوكلاء (دليل)
| # | الطريقة والمسار | الوصف |
|---|---|---|
| C1 | GET /api/agents `?governorate&q` | `AgentView[]` (12 وكيل Seed في المحافظات الثماني) |
| C2 | GET /api/agents/:id | `AgentView` |
| C3 | POST /api/cash/quote `{ type, amountMinor }` | `{ feeMinor, totalMinor }` (DEPOSIT مجاني) |
| C4 | POST /api/cash `{ type, agentId, amountMinor, pin? }` + Idempotency-Key | WITHDRAW: خصم+حجز فوري→`CashOperationView`(code)؛ DEPOSIT: طلب معلق فقط. صلاحية 24 ساعة |
| C5 | GET /api/cash | `CashOperationView[]` (مع إنهاء كسول) |
| C6 | POST /api/cash/:id/cancel | إلغاء معلق (WITHDRAW→استرجاع) |

### 5.8 الحصالة
| # | الطريقة والمسار | الوصف |
|---|---|---|
| S1 | GET /api/savings | `SavingsJarView[]` (saved من محفظة الحصالة) |
| S2 | POST /api/savings `{ name, targetMinor?, currency }` | هدف جديد |
| S3 | POST /api/savings/:id/contribute `{ amountMinor, pin }` + Idempotency-Key | MAIN→SAVINGS |
| S4 | POST /api/savings/:id/withdraw `{ amountMinor, pin }` + Idempotency-Key | SAVINGS→MAIN |
| S5 | POST /api/savings/:id/break `{ pin }` | تحطيم الحصالة (سحب كامل + BROKEN) |

### 5.9 الإشعارات والدعم
| # | الطريقة والمسار | الوصف |
|---|---|---|
| N1 | GET /api/notifications `?unread=1` | `NotificationView[]` (أحدث 50) |
| N2 | POST /api/notifications/read `{ ids?: string[], all?: boolean }` | تعليم كمقروء |
| H1 | GET /api/support/tickets | `TicketView[]` |
| H2 | POST /api/support/tickets `{ subject, category, message }` | فتح تذكرة (TK) + إشعار |
| H3 | GET /api/support/tickets/:id | `{ ticket: TicketView, messages: TicketMessageView[] }` |
| H4 | POST /api/support/tickets/:id/messages `{ body }` | رد (عميل أو SUPPORT/ADMIN) |

### 5.10 بوابة الوكيل (دور AGENT)
| # | الطريقة والمسار | الوصف |
|---|---|---|
| G1 | GET /api/agent/overview | `AgentOverviewView` |
| G2 | GET /api/agent/queue | `AgentQueueItem[]` — طلبات DEPOSIT/WITHDRAW المعلقة لدى وكيلي + (كل الحوالات PENDING تُدفع بأي وكيل عبر البحث بالرمز) |
| G3 | POST /api/agent/cash/complete `{ cashOpId, code }` | إتمام إيداع/سحب (CWD-001/2/3) — عمولة استحقاق + إشعار للمستخدم |
| G4 | POST /api/agent/remittance/pay `{ deliveryCode }` | دفع حوالة بالرمز (البحث بالرمز فقط — لا قائمة كاملة) |
| G5 | GET /api/agent/commissions | `CommissionEntryView[]` + `totalMinor` |

### 5.11 لوحة الإدارة (ADMIN؛ COMPLIANCE/SUPPORT جزئياً)
| # | الطريقة والمسار | الوصف |
|---|---|---|
| M1 | GET /api/admin/overview | `AdminOverviewView` (يشمل فحص Dفاتر Σ=0) — ADMIN/COMPLIANCE |
| M2 | GET /api/admin/users `?q&role&status&cursor` | `PageView<AdminUserRow>` — ADMIN/COMPLIANCE |
| M3 | POST /api/admin/users/:id/freeze `{ reason }` / `.../unfreeze `{ reason }` | تجميد/فك مع Audit + إشعار |
| M4 | GET /api/admin/kyc `?status` | `AdminKycRow[]` — ADMIN/COMPLIANCE |
| M5 | POST /api/admin/kyc/:id/decision `{ decision:"APPROVE"\|"REJECT", note }` | قرار + Audit + إشعار + ترقية المستوى |
| M6 | GET /api/admin/agents | `AdminAgentRow[]` — ADMIN |
| M7 | POST /api/admin/agents/:id/status `{ status, reason }` | تعليق/تفعيل وكيل — ADMIN |
| M8 | GET /api/admin/transactions `?q&status&type&cursor` | `PageView<TxView>` موسعة بuserId/phone — ADMIN/COMPLIANCE |
| M9 | GET /api/admin/limits / PUT /api/admin/limits/:id `{ dailyTxnCount, dailyAmountMinor, perTxnAmountMinor }` | ADMIN + Audit |
| M10 | GET /api/admin/fees / PUT /api/admin/fees/:id `{ pctBps, fixedMinor, minFeeMinor, maxFeeMinor? }` | ADMIN + Audit |
| M11 | GET /api/admin/fx / PUT /api/admin/fx/:id `{ rate }` | ADMIN + Audit |
| M12 | GET /api/admin/services / PUT /api/admin/services/:id `{ state, note? }` | ADMIN + Audit |
| M13 | GET /api/admin/audit `?cursor` | `PageView<AdminAuditRow>` — ADMIN/COMPLIANCE |
| M14 | GET /api/admin/pending | الحوالات/العمليات النقدية المعلقة — ADMIN |
| M15 | POST /api/admin/pending/cash/:id/cancel `{ reason }` / `.../remittance/:id/cancel `{ reason }` | إلغاء إداري باسترجاع — ADMIN |
| M16 | GET /api/admin/ledger-check | فحص توازن الدفاتر — ADMIN |

> دعم التذاكر للطاقم: نفس H1–H4 (يرون كل التذاكر) + `PUT /api/support/tickets/:id/status `{ status }` بل SUPPORT/ADMIN.

### 5.12 عام
| # | الطريقة والمسار | الوصف |
|---|---|---|
| X1 | GET /api/docs | `DocMetaView[]` (بيان 7 وثائق) |
| X2 | GET /api/docs/:slug | `{ meta, content }` (markdown خام) — slug: srs/stories/architecture/database/api/screens/roadmap |
| X3 | GET /api/qr?text=...&size= | SVG لرمز QR (مكتبة qrcode مثبتة) — Content-Type: image/svg+xml |
| X4 | GET /api/health | `{ ok, db, time }` |

## 6. محرك الدفتر (ملزم في التنفيذ الخلفي)

- كل عملية مالية داخل `prisma.$transaction([...])` واحدة: قفل/خصم المحافظ + كتابة Transaction + LedgerEntry(s) بحيث **Σ المبالغ الموقعة (DEBIT سالب/CREDIT موجب) = 0 لكل عملية لكل عملة**.
- محافظ النظام (User SYSTEM): `FEE:*`، `SUSPENSE:YER`، `FX:*` — تُموَّل في Seed بمخزن كافٍ (FX 1,000,000 وحدة/عملة).
- عوم الوكيل = محفظة `AGENT_FLOAT:YER` على User الوكيل (الرصيد الموجب = نقدية نظام لديه)؛ قيده في الدفتر بإشارة معكوسة كما في تعليق المخطط.
- حدود اليوم: TXN-002 يفحص (عدد+قيمة) عمليات COMPLETED/PENDING اليوم للعملة من Transaction.
- الإنهاء الكسول: عند أي قراءة لحوالة PENDING/عملية سحب PENDING منتهية الصلاحية → معاملة استرجاع + تحويل الحالة EXPIRED + إشعار.

## 7. خريطة الشاشات (8-b / 8-c / 8-d)

### مفاتيح التوجيه (SPA state) — التطبيق (CUSTOMER):
`splash → onboarding → login → otp → register → pin-create → biometric → home`
- home: ترويسة (الاسم+شعار+جرس الإشعارات)، بطاقة الأرصدة (CurrencyTabs YER/SAR/USD + رصيد + زر عين للإخفاء)، 8 خدمات (تحويل/حوالة/إيداع/سحب/فواتير*COMING_LATER/شحن*QR/حصالة/المزيد)، آخر العمليات (5) → الكل، بانر KYC إن NONE، بانر scope إن خارج النطاق.
- services: كتالوج كامل بحالات ServiceState (تعطيل النقر لغير ON مع شريحة الحالة).
- wallet-details/:currency: رصيد، أزرار (تحويل/استلام/إيداع/سحب)، عمليات العملة فقط.
- transfer: تبويبات (رقم/مفضلون/QR) → كمية CurrencyTabs → مراجعة (T1) → pin (A8) → تنفيذ (T2) → result (receipt).
- scan-qr: تجربة محاكاة + إدخال يدوي + كاميرا إن توفرت.
- wallet-transfer (بين محافظي): W3 → PIN → W4 → result.
- remittance-create / remittances (قائمة+تتبع) / (الإلغاء) — الرمز يظهر في بطاقة الإيصال.
- cash-deposit / cash-withdraw: اختيار وكيل من C1 (بحث/مارسة محافظة) → كمية → PIN (سحب فقط) → C4 → withdraw-code (رمز+انتهاء+إلغاء).
- agents-map: قائمة الوكلاء (بطاقات) + تصفية محافظة (خريطة صورية اختيارية بلا تكامل).
- savings (نظرة/إنشاء/إيداع/سحب/تحطيم) S1–S5.
- transactions (فلاتر/بحث/tabs حالة) → transaction-details/:ref (إيصال كامل + قيود الدفتر المصغرة) ; statement: نطاق تاريخ → T5 → عرض + تنزيل CSV.
- notifications: N1/N2 + تفريق مقروء.
- profile / kyc (K2: نموذج كامل) / security (تغيير PIN/بصمة) / devices (P1: جلساتي + إنهاء) / settings (لغة/وضع القراءة).
- help (FAQ ثابت) / ticket-new / ticket-chat/:id.
- docs-viewer: صندوق كامل يفتح من الإعدادات والقائمة — يعرض X1/X2 (markdown بreact-markdown+remark-gfm) بفهرس جانبي على سطح المكتب وقائمة منسدلة على الجوال.

### لوحات الأدوار (غير CUSTOMER): تخطيط سطح مكتب (Sidebar RTL + جداول):
- console: حسب الدور: ADMIN → (overview/users/kyc/agents/transactions/rules[حدود/رسوم/صرف/خدمات]/audit/pending/tickets)؛ COMPLIANCE → (overview/m-users قراءة/kyc/audit/m-transactions)؛ SUPPORT → (tickets فقط)؛ AGENT → بوابة الوكيل (overview/queue/commissions).
- زر "التبديل إلى عرض التطبيق" غير موجود للأدوار — كل دور يرى عالمه فقط (يحاكي RBAC الحقيقي).

### الهوية البصرية (ملزمة — من SCREENS_FLOWS §2):
- أسود `#0B0B0C` أساسي، ذهبي `#C9A227` تمييز، أسطح `#FFFFFF`/`#F7F6F2`، نجاح `#15803D`، معلق `#B45309`، خطأ `#B91C1C`، فواصل `#E8E6E1`. (داكن: `#121214`/`#1A1A1C`/`#D4B54A`...). **لا أزرق/Indigo إطلاقاً**.
- خط Cairo (مهيأ في globals.css بfont-cairo). أرقام tabular-nums.
- Radius: بطاقات 16، أزرار 12، شرائح كامل، Sheets 24 أعلى. ظلال خفيفة. لمس ≥44px.
- المكونات العشرة القياسية (PrimaryActionButton/AmountPad/CurrencyTabs/TransactionRow/StatusChip/ReceiptCard/OTPInput/PINPad/EmptyState/ErrorState) — تُبنى مرة في `src/components/app/ui/*` وتستعمل في كل مكان.
- سطح المكتب: هاتف بإطار أنيق وسط لوحة هوية جانبية (الشعار+وصف+حسابات دخول سريع+زر الوثائق)؛ الجوال: تجربة كاملة بلا إطار. الرقم السري للعرض المفرد لا يظهر أبدا.

## 8. ملكية الملفات (منع تعارض الوكلاء)

| النطاق | يملكه |
|---|---|
| prisma/schema.prisma, src/lib/api-types.ts, src/lib/api.ts, src/app/page.tsx, src/app/layout.tsx, globals.css | 8-0 (مثبتة — لا يعدلها أحد إلا بتنسيق) |
| src/app/api/** , src/lib/server/**, prisma/seed.ts | 8-a |
| src/components/app/ui/**, src/components/app/shell/**, src/components/app/auth/**, src/components/app/home/**, src/lib/app-store.ts | 8-b |
| src/components/app/features/** (تحويل/حوالة/نقدي/حصالة/سجل/إشعارات/ملف/دعم/وثائق) | 8-c |
| src/components/app/console/** | 8-d |
| إزالة ملفات البوابة القديمة (portal-*, overview-view, markdown-content, srs-viewer إن وجد) | 8-e |

## 9. قواعد الجودة لكل وكيل

1. اقرأ `worklog.md` أولاً + هذه الوثيقة + الملفات التي تملكها فوقها.
2. `bun run lint` نظيف قبل التسليم — أصلح أخطاءك بنفسك.
3. راقب `tail -40 dev.log` بعد التغييرات الكبيرة.
4. لا تكتب اختبارات مؤتمتة — تحقق يدوي عبر curl/browser حيث ينطبق.
5. علّق كل ملف جديد بترويسة عربية قصيرة تشرح دوره.
6. **ألحق قسمك في worklog.md بالقالب الرسمي** (Task ID / Agent / Work Log / Stage Summary).
