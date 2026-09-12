# قائمة نقاط النهاية (REST API) — محفظة الجنوب

## بطاقة الوثيقة

| البند | القيمة |
|---|---|
| اسم المنتج | محفظة الجنوب — South Wallet |
| معرّف الحزمة (Package Name) | `com.janoub.wallet` |
| إصدار الوثيقة | 1.0 |
| حالة الوثيقة | مسودة بانتظار اعتماد صاحب المنتج |
| المعيار المتبع | REST (JSON/HTTPS) — OpenAPI 3.1-ready |
| وثائق مرجعية | docs/SRS.md (المرجع التعاقدي) + docs/ARCHITECTURE.md (§6 الوحدات، §7 محرك المعاملات، §8 الأمان) + docs/DATABASE_ERD.md (أسماء الجداول والمصطلحات) + Master PLAN.md (§16, §19, §55, §61, §67, §70, §82, §105, §106, §132) |
| نطاق الوثيقة | عقود نقاط النهاية الكاملة لخادم NestJS Modular Monolith: تطبيق الموبايل (عميل/وكيل/تاجر) + لوحة الإدارة + Webhooks المزودين |
| لغة الوثيقة | العربية (أساس) مع مسارات وأسماء تقنية لاتينية |

> هذه الوثيقة **تصميم عقود فقط** — لا كود تطبيق. الأمثلة JSON توضيحية للعقد. كل نقطة نهاية تُنفَّذ داخل الوحدة المعمارية المالكة لها وفق ARCHITECTURE §6.2، وتُولَّد منها DTOs العملاء عبر OpenAPI (ADR-011).

---

# 1. الأساسيات (تبدأ من هنا)

## 1.1 النقل والبيئات

REST/JSON عبر HTTPS (TLS 1.2+، Certificate Pinning في التطبيق — NFR-SEC-001):

| البيئة | Base URL |
|---|---|
| الإنتاج | `https://api.janoubwallet.com/v1` |
| Staging | `https://api.staging.janoubwallet.com/v1` |
| Development | `https://api.dev.janoubwallet.internal/v1` (شبكة داخلية فقط) |

لوحة الإدارة (web-admin) تستهلك **نفس** هذه البوابة عبر نطاق إداري منفصل خلف قيود IP اختيارية (ARCHITECTURE §5) — مصدر حقيقة واحد (Master PLAN §96).

## 1.2 التوثيق (Authentication)

- **`Authorization: Bearer <access_token>`** — JWT صلاحية **15 دقيقة** (ADR-005)، موقَّع، عديم الحالة على الخوادم.
- **`POST /auth/refresh`** — تدوير Refresh Token (Rotation) مع **Reuse Detection**: استخدام Refresh مُستهلك = تسريب محتمل → إبطال عائلة الجلسة + Security Event (ARCHITECTURE §8.1).
- لوحة الإدارة: نفس النمط لكن بعائلة جلسات إدارية منفصلة (`admin_sessions`) + **MFA (TOTP) إلزامي** قبل إصدار الجلسة (FR-ADM-002).
- نقاط ما قبل التوثيق (Bootstrap، طلب OTP، تسجيل/Dخول) تعمل بدون Bearer لكن مع الرؤوس العامة (§1.3).

## 1.3 الرؤوس العامة (إلزامية)

| الرأس | القيم | الإلزامية | الغرض |
|---|---|---|---|
| `X-Device-Id` | UUID ثابت لكل جهاز | كل طلبات التطبيق | ربط الجهاز وبصمته وRate Limiting لكل جهاز |
| `X-App-Version` | `1.4.2` (semantic) | كل طلبات التطبيق واللوحة | فحص الحد الأدنى للإصدار (Force Update — §52) |
| `X-App-Platform` | `android` \| `ios` \| `web-admin` | كل الطلبات | تمييز القناة + إحصاءات |
| `Accept-Language` | `ar` (افتراضي) \| `en` | كل الطلبات | لغة رسائل المستخدم والرسوم/التواريخ (NFR-L10N-001) |
| `Idempotency-Key` | UUID v4 | **كل POST مالي** (إلزامي) | تماثل العملية: نفس المفتاح = نفس النتيجة (Master PLAN §16) |
| `X-Signature` + `X-Timestamp` | HMAC-SHA256 | Webhooks المزودين فقط (§23) | التحقق من هوية المزود |

## 1.4 مبدأ كل API (Master PLAN §132)

كل نقطة نهاية تمر بهذا الأنبوب بالترتيب — أي فشل في خطوة يُرجَع برمز خطأ مقنّن صريح، ولا "نجاح افتراضي" في أي مرحلة (R-08):

```
Authentication → Authorization → Validation → Idempotency (حيث يلزم)
→ Business Rule → Transaction → Result
```

وخط الدفاع المفصّل للطلب المالي الواحد (ARCHITECTURE §8.2):

```
TLS/Pinning → Rate Limit (Redis) → JWT Verify → Device Fingerprint Check
→ RBAC Guard (Scope) → System/Service State → Input Validation
→ Idempotency → Eligibility (multi-signal) → Risk Engine → Limits
→ Balance Lock → Atomic Tx → Audit → Notify
```

**الخادم لا يترك الحسابات الحساسة للعميل (R-10):** الرسوم والحدود والأسعار تُقرأ من الوحدات المركزية (fees / limits / wallet-core) — القيم المعروضة في التطبيق "عرض مراجعي" فقط وغير ملزمة للخادم. العميل **يطلب اقتباساً (Quote)** ولا يحسب شيئاً.

## 1.5 غلاف الاستجابة الموحد (Master PLAN §82)

نجاح:

```json
{
  "success": true,
  "data": { },
  "meta": { "request_id": "req_01J8Z...", "generated_at": "2026-09-11T10:32:11+03:00" }
}
```

فشل — المستخدم يرى `message` مفهومة بالعربية، والمطوّر يرى `context` التقني (والتفاصيل الكاملة في Logs فقط — NFR-SEC-011):

```json
{
  "success": false,
  "error": {
    "code": "ERR_TRF_INSUFFICIENT_BALANCE",
    "message": "الرصيد غير كافٍ لإتمام العملية",
    "context": { "available": "45000.00", "required": "50250.00", "currency": "YER" }
  },
  "meta": { "request_id": "req_01J8Z..." }
}
```

`meta` في القوائم تحمل الترقيم: `{ "next_cursor": "eyJ0e...", "has_more": true, "limit": 20 }`، وفي العمليات المكررة: `{ "idempotent_replay": true }`.

## 1.6 الترقيم (Pagination) — Cursor-based

- كل قوائم السجلات: `?limit=20&cursor=<opaque>` (النطاق 20–50 — NFR-PER-004) لأن السجلات ضخمة ومقسّمة شهرياً (FR-STM-003).
- الترتيب افتراضياً تنازلي بالزمن (الأحدث أولاً). `cursor` معتم (Opaque Base64url) ولا يُبنى في العميل.
- الاستجابة تعيد `next_cursor` فقط عند وجود صفحة تالية (`has_more: true`).

## 1.7 المبالغ والعملات

- `amount` دائماً **string عشري** (مثل `"50000.00"`) + `currency` (`YER` / `SAR` / `USD`) — **لا أرقام float** أبداً (التخزين NUMERIC(18,4) في PostgreSQL).
- كل طلب مالي يعيد كائن `transaction` موحداً:

```json
{
  "id": "txn_01J8ZK3M2Q",
  "reference": "SW-20260911-8F3K2Q9A",
  "type": "TRANSFER",
  "status": "COMPLETED",
  "amount": "50000.00",
  "fee": "250.00",
  "total": "50250.00",
  "currency": "YER",
  "created_at": "2026-09-11T10:32:11+03:00",
  "completed_at": "2026-09-11T10:32:12+03:00"
}
```

- المرجع `SW-YYYYMMDD-XXXXXXXX` فريد عالمياً (FR-LDG-005) ويُستخدم في الإيصالات والبحث والدعم والتدقيق.
- أنواع المعاملات (`type`): `TRANSFER` / `FX_CONVERT` / `REMITTANCE` / `DEPOSIT` / `WITHDRAWAL` / `PAYMENT` / `TOPUP` / `BILL_PAYMENT` / `NETWORK_CARD` / `SAVING` / `REVERSAL` / `ADJUSTMENT`.
- حالات المعاملة (`status`): `CREATED → VALIDATING → AUTHORIZED → PROCESSING → COMPLETED` مع `FAILED / REJECTED / CANCELLED / EXPIRED / REVERSED / UNDER_REVIEW` (ملحق أ SRS — لا انتقالات عشوائية).

## 1.8 انقطاع الشبكة (Master PLAN §67 / FR-LDG-009 / AC-04)

عند انقطاع الاتصال بعد إرسال طلب مالي وقبل وصول النتيجة: عند العودة يستعلم التطبيق عن **حالة العملية الأصلية نفسها** (`GET /transfers/{id}` أو نتيجة إعادة إرسال نفس الطلب بنفس `Idempotency-Key`) ولا ينشئ طلباً جديداً. إذا عاد 404 (`ERR_TXN_NOT_FOUND`) فالطلب لم يصل الخادم أصلاً — الآمن إنشاء طلب جديد بمفتاح جديد. قبل السماح بعملية جديدة يستعلم التطبيق عن أي عملية معلقة (FR-OFF-003).

## 1.9 نمط Quote → Confirm لكل عملية مالية

كل تدفق مالي (تحويل، حوالة، سحب، دفع، شحن، سداد، كروت، FX، حصالة) يتبع:

```
اختيار المعطيات → GET/POST quote (رسوم + إجمالي + quote_id + expires_at)
→ تأكيد المستخدم (PIN proof) → POST التنفيذ (Idempotency-Key)
→ transaction object (حتى لو Pending بانتظار مزود)
```

- `quote` يُثبَّت فيه `fee_rule_id + fee_version` (لقطة الرسوم — §37/FR-LDG-011) وصلاحيته قصيرة (60 ثانية افتراضياً).
- الخادم **يعيد حساب كل شيء** عند التنفيذ ويقبل `quote_id` كتلميح فقط (R-10).

## 1.10 إثبات PIN للعمليات الحساسة (PIN Proof)

العمليات الحساسة (تحويل، حوالة، سحب، دفع، شحن، سداد، كروت، حصالة، FX، تغيير PIN) تتطلب `pin_proof`: التوكن المؤقت القصير الصلاحية (5 دقائق) الصادر من `POST /auth/pin/verify` (FR-AUTH-016). فشل الإثبات = `ERR_AUTH_PIN_PROOF_REQUIRED` أو `ERR_AUTH_PIN_INCORRECT` مع التأخير التصاعدي (FR-AUTH-017).

## 1.11 أكواد HTTP المستخدمة (حصراً)

| الكود | الدلالة في هذا النظام |
|---|---|
| 200 | نجاح (قراءة/تحديث/إجراء مكتمل) — بما فيه إعادة تشغيل Idempotency |
| 201 | إنشاء مورد ناجح (معاملة، تذكرة، مفضل...) |
| 400 | طلب مشوّه: غلاف/رؤوس ناقصة، JSON غير صالح، `Idempotency-Key` غير صالح لعملية مالية |
| 401 | غير موثّق: توكن منتهٍ/غير صالح، OTP خاطئ/منتهٍ، MFA مطلوبة |
| 403 | ممنوع: صلاحية، Scope، أهلية جغرافية، حالة حساب/خدمة، جهاز محظور |
| 404 | مورد غير موجود (مستفيد/عملية/تذكرة/وكيل...) — يُميَّز عن 403 دوماً |
| 409 | تعارض حالة: رقم مسجل مسبقاً، حالة لا تسمح بالإجراء، موافقة ثانية معلّقة، انتهت صلاحية الاقتباس |
| 422 | فشل قواعد العمل (Validation دلالي): رصيد، حدود، مبلغ أدنى/أعلى، بيانات ناقصة دلالياً |
| 423 | مقفل: حساب مجمّد، PIN مقفل، عملية قيد مراجعة (UNDER_REVIEW) |
| 429 | تجاوز المعدل/المحاولات: Rate Limiting، محاولات OTP/PIN، حد إرسال SMS |
| 500 | خطأ داخلي — التفاصيل التقنية في Logs مع `request_id` فقط |
| 503 | غير متاح: صيانة النظام، وضع القراءة فقط، خدمة معطّلة، مزود غير متاح (مع حالة Pending معلنة) |

## 1.12 أدوار المستخدمين المشار إليها في عمود "الدور المسموح"

| الدور | الوصف والنطاق (SRS §2.3) |
|---|---|
| زائر (عام) | بدون توثيق — Bootstrap وطلب OTP فقط |
| عميل | المستخدم النهائي — كل خدمات التطبيق وفق مستوى KYC والحدود |
| عميل+وكيل | حساب وكيل مفعّل (`agents.status = ACTIVE`) — صلاحيات العميل + شاشة الوكيل (Float/التسوية) |
| وكيل | نقاط وضع الوكيل حصراً (EP-AGT) |
| تاجر | وضع التاجر حصراً (EP-MRC) — استلام مدفوعات/QR/تسويات |
| الإدارة (Super) | Super Admin — كل الوظائف + إدارة الأدوار |
| الإدارة (Finance) | الرسوم/الحدود/العملات/FX/التسويات/Adjustments/التقارير المالية |
| الإدارة (Operations) | المستخدمون/الوكلاء/التجار/المعاملات المعلقة/الخدمات/المناطق |
| الإدارة (Security) | مراجعة KYC، الأحداث الأمنية، الحالات المشبوهة، الأجهزة والجلسات |
| الإدارة (Support) | التذاكر، البحث في المعاملات، الإجراءات المسموحة فقط |
| الإدارة (Content) | البانرات/FAQ/الشروط/الإشعارات الجماعية/الإصدارات |
| Auditor | قراءة فقط لكل السجلات والتقارير وسجل التدقيق — لا أي تعديل |
| مزود خارجي | Webhooks المزودين (توقيع HMAC — §23) |

الصلاحيات تُفرض في Guards الخادم بنموذج Role → Permission → Scope (قابل للتهيئة) — إخفاء الزر في الواجهة لا يُعدّ صلاحية (AC-09).

---

# 2. أكواد الأخطاء الموحدة (Error Codes)

صيغة كل خطأ: `code` (machine_code) + `message` (user_message عربية) + `context` (technical_context) — Master PLAN §82، NFR-SEC-011. الأكواد مقسّمة عائلات، وكل عائلة تُستخدم عبر كل المجموعات المناظرة لها.

## 2.1 عائلة ERR_AUTH — المصادقة والجلسات وPIN

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_AUTH_OTP_INVALID | 401 | رمز التحقق غير صحيح | hash OTP غير مطابق |
| ERR_AUTH_OTP_EXPIRED | 401 | انتهت صلاحية رمز التحقق، اطلب رمزاً جديداً | تجاوز TTL (5 دقائق) |
| ERR_AUTH_OTP_MAX_ATTEMPTS | 429 | تجاوزت المحاولات المسموحة، أعد المحاولة بعد 15 دقيقة | 5 محاولات فاشلة → قفل مؤقت (FR-AUTH-001) |
| ERR_AUTH_OTP_RESEND_EARLY | 429 | يرجى الانتظار قبل طلب رمز جديد | مهلة إعادة الإرسال 60 ثانية |
| ERR_AUTH_OTP_DAILY_LIMIT | 429 | بلغت الحد اليومي لرسائل التحقق لهذا الرقم | مضاد إساءة SMS (FR-AUTH-002) |
| ERR_AUTH_PHONE_EXISTS | 409 | هذا الرقم مسجل مسبقاً؛ استخدم الدخول أو استعادة الحساب | قيد UNIQUE على users.phone |
| ERR_AUTH_SESSION_EXPIRED | 401 | انتهت الجلسة، سجّل الدخول من جديد | انتهاء صلاحية access token |
| ERR_AUTH_REFRESH_REUSED | 401 | رُصد نشاط أمني على جلستك، سجّل الدخول من جديد | Reuse Detection → إبطال عائلة الجلسة (ADR-005) |
| ERR_AUTH_PIN_INCORRECT | 422 | رمز PIN غير صحيح | تحقق Argon2id فاشل + تأخير تصاعدي |
| ERR_AUTH_PIN_LOCKED | 423 | قُفل رمز PIN مؤقتاً بسبب المحاولات؛ تواصل مع الدعم | بلوغ حد السياسة (FR-AUTH-017) |
| ERR_AUTH_PIN_WEAK | 422 | اختر رمز PIN أقوى (تجنب المتتاليات والتكرار) | قواعد قوة PIN |
| ERR_AUTH_PIN_PROOF_REQUIRED | 401 | هذه العملية تتطلب تأكيد رمز PIN | pin_proof مفقود أو منتهٍ (FR-AUTH-016) |
| ERR_AUTH_DEVICE_BLOCKED | 403 | هذا الجهاز محظور؛ تواصل مع الدعم | devices.status = BLOCKED |
| ERR_AUTH_ACCOUNT_FROZEN | 423 | حسابك مجمّد مؤقتاً؛ تواصل مع الدعم | users.status = FROZEN (R- تجميد مسجل) |
| ERR_AUTH_ACCOUNT_SUSPENDED | 403 | الحساب موقوف | users.status = SUSPENDED / CLOSED |

## 2.2 عائلة ERR_GEO — الأهلية الجغرافية (R-06: قرار متعدد الإشارات)

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_GEO_OUTSIDE_AREA | 403 | الخدمة غير متاحة في منطقتك حالياً | التقييم متعدد الإشارات = OUTSIDE_SERVICE_AREA (FR-GEO-012) |
| ERR_GEO_REGION_CLOSED | 403 | التسجيل غير متاح في منطقتك حالياً | allow_registration=false للمنطقة (FR-GEO-003) |
| ERR_GEO_VIEW_ONLY | 403 | خارج نطاق الخدمة يُسمح بالاطلاع فقط | FR-GEO-013 — دخول وقراءة بلا عمليات |
| ERR_GEO_SPOOF_DETECTED | 403 | تعذّر التحقق من موقعك؛ تواصل مع الدعم | mock location / سرعة انتقال غير منطقية / تناقض GPS-IP (FR-GEO-007) |
| ERR_GEO_EMULATOR_FLAGGED | 403 | الخدمة غير متاحة على هذا الجهاز حالياً | محاكي/روت/جيلبريك حسب سياسة المنطقة (FR-GEO-009) |
| ERR_GEO_VPN_FLAGGED | 403 | أوقف VPN وأعد المحاولة | سياسة VPN=BLOCK عبر فحص ASN/IP (FR-GEO-008) |
| ERR_GEO_REVIEW_REQUIRED | 423 | طلبك قيد المراجعة الأمنية وسيتم إبلاغك | الأهلية = PENDING_REVIEW / RESTRICTED |

## 2.3 عائلة ERR_TRF — قواعد العمل المالية (تحويل/حوالة/سحب/دفع/خدمات)

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_TRF_INSUFFICIENT_BALANCE | 422 | الرصيد غير كافٍ لإتمام العملية | available (لا total) < المبلغ+الرسوم |
| ERR_TRF_LIMIT_DAILY | 422 | تجاوزت الحد اليومي لهذه العملية/العملة | limit_rules: usage + requested > daily |
| ERR_TRF_LIMIT_MONTHLY | 422 | تجاوزت الحد الشهري لهذه العملة | حد شهري/أسبوعي/رصيد (FR-LDG-012) |
| ERR_TRF_KYC_LEVEL | 403 | يلزم رفع مستوى التوثيق لهذا المبلغ | الحد مرتبط بمستوى KYC (FR-KYC مستويات) |
| ERR_TRF_BENEFICIARY_NOT_FOUND | 404 | لا يوجد مستفيد بهذا الرقم | users.phone غير موجود |
| ERR_TRF_BENEFICIARY_INACTIVE | 422 | حساب المستفيد غير نشط حالياً | حالة المستفيد FROZEN/SUSPENDED/CLOSED |
| ERR_TRF_AMOUNT_MIN | 422 | المبلغ أقل من الحد الأدنى المسموح | الحد الأدنى للخدمة/العملة |
| ERR_TRF_AMOUNT_MAX | 422 | المبلغ أعلى من الحد الأعلى المسموح | الحد الأعلى للخدمة/العملة |
| ERR_TRF_AMOUNT_INVALID | 422 | قيمة المبلغ غير صالحة | صيغة/دقة عشرية/صفر/سالب |
| ERR_TRF_CURRENCY_DISABLED | 422 | هذه العملة غير مفعّلة لهذه العملية | currencies: transfer/deposit/withdrawal_enabled |
| ERR_TRF_SELF_TRANSFER | 422 | التحويل لنفسك يتم عبر التحويل بين محافظك | استخدم /wallets/fx/convert |
| ERR_TRF_SERVICE_OFF | 503 | هذه الخدمة متوقفة مؤقتاً | services.state = OFF/MAINTENANCE (FR-ADM-037) |

## 2.4 عائلة ERR_TXN — المعاملات والتماثل

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_TXN_IDEMPOTENCY_REPLAY | 200 | (ليست خطأ) أُعيدت نتيجة طلبك السابق | نفس Idempotency-Key = نفس النتيجة دون تنفيذ مزدوج (§16) |
| ERR_TXN_IDEMPOTENCY_KEY_INVALID | 400 | مفتاح العملية غير صالح | UUID ناقص/مكرر الصيغة لعملية POST مالية |
| ERR_TXN_NOT_FOUND | 404 | العملية غير موجودة | المعرف غير موجود أو لا يملكه المستخدم |
| ERR_TXN_STATE_INVALID | 409 | لا يمكن تنفيذ هذا الإجراء في الحالة الحالية | انتقال غير مسموح في آلة الحالة (ملحق أ) |
| ERR_TXN_UNDER_REVIEW | 423 | العملية قيد المراجعة وسيتم إبلاغك بالنتيجة | UNDER_REVIEW (محرك المخاطر REVIEW) |
| ERR_TXN_EXPIRED | 409 | انتهت مهلة هذه العملية | EXPIRED (سحب/حوالة/اقتباس) |
| ERR_TXN_QUOTE_EXPIRED | 409 | انتهت صلاحية الاقتباس؛ أعد الطلب ثم أكّد | تجاوز quote TTL (60 ثانية) |
| ERR_TXN_IDEMPOTENCY_CONFLICT | 409 | مفتاح العملية مستخدم بمعطيات مختلفة | نفس المفتاح مع payload مختلف (شبهة تلاعب) |

## 2.5 عائلة ERR_ADM — الإدارة والصلاحيات وMaker-Checker

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_ADM_PERMISSION_DENIED | 403 | لا تملك صلاحية تنفيذ هذا الإجراء | RBAC Guard: Permission غير ممنوحة للدور |
| ERR_ADM_SCOPE_VIOLATION | 403 | الإجراء خارج نطاقك (منطقة/كيان) | Scope: GLOBAL/REGION/ENTITY (FR-ADM-001) |
| ERR_ADM_MFA_REQUIRED | 401 | أكمل التحقق الثنائي أولاً | جلسة إدارية ناقصة MFA |
| ERR_ADM_MFA_INVALID | 401 | رمز التحقق الثنائي غير صحيح | TOTP خاطئ/منتهي نافذته |
| ERR_ADM_REASON_REQUIRED | 422 | سبب الإجراء إلزامي | إجراء حساس بلا reason (FR-ADM-003) |
| ERR_ADM_SECOND_APPROVAL_REQUIRED | 409 | يتطلب هذا الإجراء موافقة ثانية معلّقة | Maker-Checker قيد انتظار Checker |
| ERR_ADM_ALREADY_DECIDED | 409 | تم البت في هذا الطلب مسبقاً | قرار KYC/Adjustment مُسجّل |

## 2.6 عائلة ERR_SYS — النظام والتوفر والإصدارات

| الكود | HTTP | رسالة المستخدم | المعنى التقني |
|---|---|---|---|
| ERR_SYS_VERSION_UNSUPPORTED | 400 | حدّث التطبيق للمتابعة (إصدارك أقدم من الحد الأدنى) | X-App-Version < minimum → force_update (§52) |
| ERR_SYS_MAINTENANCE | 503 | النظام تحت الصيانة، نعود قريباً | system_state = MAINTENANCE (FR-ADM-041) |
| ERR_SYS_READ_ONLY | 503 | النظام في وضع القراءة فقط مؤقتاً | READ_ONLY: يمنع الجديد ويسمح بالاطلاع |
| ERR_SYS_RATE_LIMITED | 429 | طلبات كثيرة جداً؛ انتظر قليلاً | Rate Limiting لكل رقم/IP/جهاز/نقطة (NFR-SEC-006) |
| ERR_SYS_VALIDATION | 422 | تحقق من البيانات المدخلة | فشل Validation عام (حقول مطلوبة/صيغ) |
| ERR_SYS_PROVIDER_UNAVAILABLE | 503 | مزود الخدمة غير متاح؛ عمليتك قيد المتابعة وسيتم إبلاغك | Adapter يعلّم مزوداً غير متاح → Pending (§69) |
| ERR_SYS_INTERNAL | 500 | حدث خطأ غير متوقع؛ أعد المحاولة (رمز الطلب: request_id) | استثناء غير معالج — تفاصيله في Logs فقط |

## 2.7 عائلة ERR_HWK — Webhooks المزودين (§23)

| الكود | HTTP | الرسالة (للمزود) | المعنى التقني |
|---|---|---|---|
| ERR_HWK_SIGNATURE_INVALID | 401 | توقيع غير صالح | HMAC-SHA256 لا يطابق X-Signature |
| ERR_HWK_TIMESTAMP_SKEW | 401 | طابع زمني خارج النافذة المسموحة | مكافحة Replay (نافذة ±5 دقائق) |
| ERR_HWK_DUPLICATE_EVENT | 200 | (ليست خطأ) حدث مكرر — تجاهل | Idempotent بالمعرف الخارجي (provider_webhook_events) |

> **قاعدة عامة:** لا يُعاد أي 500 إلا مع `request_id` للمستخدم — التفاصيل التقنية الكاملة (stack, provider payload) في Application Logs مع correlation_id فقط (NFR-MNT-005).

---

# 3. Bootstrap والتكوين (EP-BOOT) — قبل التوثيق

**الوحدة المالكة:** content-config (Remote Config/الإصدارات/حالات النظام) — **المرتبطة:** identity (فحص إصدار مبكر)، geo-eligibility (المناطق المتاحة للتسجيل)، wallet-core (العملات المرئية). أول نداء يرسله التطبيق عند الإقلاع (قبل أي توثيق) لتغطية FR-OFF-001..003 و§52/§96/§97 من Master PLAN — بحدود Remote Config للتحكم والسياسات فقط (§98: لا منطق مالي موازٍ).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-BOOT-01 | POST | /bootstrap | فحص X-App-Version مقابل الحد الأدنى وإرجاع: force_update (latest/minimum/store_url/release_notes)، system_state، service_states (ON/OFF/MAINTENANCE)، feature_flags، المناطق المتاحة للتسجيل (regions.allow_registration)، روابط الدعم/الشروط/الخصوصية (آخر نسخة)، العملات المرئية وأعلام إظهارها (currency_visibility) | عام (رؤوس عامة إلزامية، بلا Bearer) | زائر | MVP |

ملاحظات العقد: يستجيب دوماً 200 حتى في MAINTENANCE (الحالة داخل `data`) إلا عند `force_update=true` مع طلبات لاحقة فتُرفض بـ`ERR_SYS_VERSION_UNSUPPORTED`. التطبيق يعيد النداء عند العودة من الخلفية/الشبكة لالتقاط تغيّر الحالة دون إصدار جديد (FR-ADM-037، Master §96).

---

# 4. المصادقة والجلسات (EP-AUTH)

**الوحدة المالكة:** identity (تسجيل/OTP/دخول/PIN/أجهزة/جلسات/JWT+تدوير) — **المرتبطة:** geo-eligibility (فحص الأهلية عند التسجيل والدخول)، risk-engine (إشارات المحاولات والأجهزة)، notifications (تنبيهات أمنية FR-NTF-003)، wallet-core (إنشاء المحافظ عند التسجيل — FR-AUTH-007).

التسجيل متعدد الخطوات (FR-AUTH-001..007): طلب OTP → تحقق → إكمال البيانات+المنطقة+الشروط+PIN+الجهاز في خطوة واحدة ذرّية.

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-AUTH-01 | POST | /auth/register/request-otp | طلب OTP للتسجيل برقم محلي صالح + region_code (فحص FR-GEO-003 قبل الإرسال) | عام | زائر | MVP |
| EP-AUTH-02 | POST | /auth/register/verify-otp | تحقق OTP (5 محاولات/قفل 15 دقيقة) وإصدار registration_token مؤقت | عام | زائر | MVP |
| EP-AUTH-03 | POST | /auth/register/complete | إكمال التسجيل: البيانات + المنطقة + الموافقة على الشروط (نسخة الشروط) + تعيين PIN + بصمة الجهاز → إنشاء الحساب والمحافظ والجلسة | registration_token | زائر | MVP |
| EP-AUTH-04 | POST | /auth/login/request-otp | طلب OTP للدخول: جهاز جديد (FR-AUTH-012) أو نسيان PIN (FR-AUTH-009) | عام | زائر | MVP |
| EP-AUTH-05 | POST | /auth/login | الدخول: الهاتف + PIN (أو biometric على جهاز موثوق)؛ يرفق بصمة الجهاز؛ جهاز جديد يتطلب otp_code ويطلق تنبيهاً أمنياً | عام | زائر | MVP |
| EP-AUTH-06 | POST | /auth/refresh | تدوير Refresh Token (Rotation) وإصدار access جديد — Reuse Detection يبطل عائلة الجلسة | Refresh Token | عميل/وكيل/تاجر | MVP |
| EP-AUTH-07 | POST | /auth/logout | إنهاء الجلسة الحالية؛ و`/auth/logout-all` (مسار شقيق) ينهي كل جلسات المستخدم — إلغاء مركزي للتوكنات (FR-AUTH-014/023) | Bearer | عميل | MVP |
| EP-AUTH-08 | POST | /auth/pin | تعيين PIN أول مرة أو إعادة تعيينه بعد إثبات OTP (FR-AUTH-009) — PIN يُخزَّن Argon2id في الخادم فقط | Bearer أو OTP proof | عميل | MVP |
| EP-AUTH-09 | PUT | /auth/pin | تغيير PIN: القديم + الجديد + OTP (FR-AUTH-019) | Bearer + OTP | عميل | MVP |
| EP-AUTH-10 | POST | /auth/pin/verify | إثبات PIN للعمليات الحساسة → pin_proof_token مؤقت (5 دقائق) يُرفق بالطلبات المالية | Bearer | عميل | MVP |
| EP-AUTH-11 | POST | /auth/devices | تسجيل جهاز جديد/تحديث بصمته (platform/model/fingerprint) وربطه بالمستخدم | Bearer | عميل | MVP |
| EP-AUTH-12 | GET | /auth/devices | قائمة أجهزتي (منصة، أول/آخر ظهور، موثوق/محظور، حالة المخاطر) | Bearer | عميل | MVP |
| EP-AUTH-13 | POST | /auth/devices/{id}/revoke | إلغاء ثقة جهاز + إنهاء جلساته (يتطلب OTP — FR-AUTH-021) | Bearer + OTP | عميل | MVP |

ملاحظات العقد: كل من EP-AUTH-01/04 يخضع لمهلة 60 ثانية وحد يومي لكل رقم (FR-AUTH-002). EP-AUTH-05 يرجع `requires_otp: true` مع `ERR_AUTH_SESSION_EXPIRED`-مثل سياق عند جهاز جديد بدل تنفيذ الدخول مباشرة. فشل PIN يرجع تأخيراً تصاعدياً في `context.retry_after` (FR-AUTH-017).

---

# 5. التوثيق KYC (EP-KYC)

**الوحدة المالكة:** kyc (المستويات، المستندات، الطابور، القرارات) — **المرتبطة:** provider-adapters/التخزين (Signed URLs — ADR-008)، risk-engine (إشارات)، notifications (تغيّر الحالة FR-NTF-003). حالات KYC: `NOT_STARTED → PENDING → UNDER_REVIEW → APPROVED / REJECTED / EXPIRED / REQUIRES_UPDATE`.

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-KYC-01 | GET | /kyc/requirements | متطلبات المرحلة الحالية/التالية (المستندات المطلوبة، الحدود الناتجة، القيود: وضوح/حجم/صيغة — FR-KYC-002) | Bearer | عميل | MVP |
| EP-KYC-02 | POST | /kyc/documents/upload-requests | طلب رفع مستند → URL موقّع مؤقت (S3-compatible) + document_id — لا رفع مباشر عبر API (FR-KYC-006، ADR-008) | Bearer | عميل | MVP |
| EP-KYC-03 | POST | /kyc/submit | تقديم للمراجعة (بعد رفع المستندات؛ يرفق إحداثيات GPS اختيارية — FR-KYC-003)؛ يخدم أيضاً إعادة التقديم بعد رفض (بعد المهلة — FR-KYC-005) | Bearer | عميل | MVP |
| EP-KYC-04 | GET | /kyc/status | حالة KYC الحالية + المستوى + سبب الرفض المقنّن إن وجد + أقرب موعد لإعادة التقديم | Bearer | عميل | MVP |

ملاحظات العقد: `POST /kyc/documents/upload-requests` يتحقق من النوع والحجم قبل التوقيع، والرفع الفعلي يذهب للتخزين مباشرة ثم يؤكَّد عبر EP-KYC-03. فحص القوائم السوداء AML قبل الاعتماد (FR-KYC-009) يجري خادمياً داخل طابور المراجعة (EP-ADM).

---

# 6. المحافظ والعملات (EP-WLT)

**الوحدة المالكة:** wallet-core (المحافظ، الأرصدة available/pending/frozen، العملات، Hold) — **المرتبطة:** transaction-engine (تنفيذ FX)، fees (رسوم التحويل بين العملات)، limits، exchange_rates (لقطة السعر لحظة التنفيذ — FR-WLT-006).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-WLT-01 | GET | /wallets | أرصدة كل المحافظ: لكل عملة available/pending/frozen + الحالة + المكافئ التقديري بعملة العرض (FR-WLT-002/007) — من الخادم فقط (R-01) | Bearer | عميل | MVP |
| EP-WLT-02 | GET | /wallets/{currency} | محفظة عملة واحدة بالتفصيل + آخر الحركات عليها | Bearer | عميل | MVP |
| EP-WLT-03 | GET/POST | /wallets/fx/quote | GET: سعر زوج العملة الحالي؛ POST: اقتباس مُثبَّت (quote_id + rate + fee + expires_at) لمبلغ محدد | Bearer | عميل | Beta |
| EP-WLT-04 | POST | /wallets/fx/convert | تنفيذ تحويل بين محافظ المستخدم (FX داخلي) بسعر اللقطة + رسوم قابلة للتهيئة (FR-TRF-008) | Bearer + Idempotency-Key + PIN proof | عميل | Beta |

ملاحظات العقد: إنشاء المحافظ تلقائي حسب العملات المفعّلة (FR-WLT-001) عند التسجيل. `GET /wallets` يرجع `as_of` (زمن الجلب) — التطبيق يوسم العرض "بيانات قديمة" عند انقطاع (FR-OFF-001).

---

# 7. التحويلات (EP-TRF)

**الوحدة المالكة:** transfers (تحويل لمشترك + بين محافظ المستخدم) — **المرتبطة:** transaction-engine (التنفيذ الذرّي، Idempotency)، wallet-core، fees، limits، risk-engine، notifications (إشعار الطرفين — FR-TRF-005). البحث عن المستفيد يخفي الاسم جزئياً (Master PLAN §19، FR-TRF-001).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-TRF-01 | GET | /transfers/beneficiaries?phone= | بحث مستفيد بالهاتف قبل التأكيد: يعيد الاسم مقنّعاً ("أح*** م") + مستوى KYC + صلاحية الاستقبال — لحماية الخصوصية (§19) | Bearer | عميل | MVP |
| EP-TRF-02 | POST | /transfers/quote | اقتباس رسوم التحويل: المبلغ + الرسوم (لقطة fee_rule_id+version) + الإجمالي المخصوم + quote_id + expires_at (FR-TRF-003) | Bearer | عميل | MVP |
| EP-TRF-03 | POST | /transfers | تنفيذ التحويل بين مشتركين (Idempotency-Key إلزامي)؛ الخادم يتحقق من كل شيء (الأطراف/العملة/الرصيد/الحدود/الخدمة/المنطقة/التكرار/المخاطر — FR-TRF-004) ثم عملية ذرّية + إيصال | Bearer + Idempotency-Key + PIN proof | عميل | MVP |
| EP-TRF-04 | GET | /transfers/{id} | حالة تحويل واحد — تُستخدم بعد انقطاع الشبكة للاستعلام عن العملية الأصلية نفسها (§67، AC-04) | Bearer | عميل | MVP |
| EP-TRF-05 | GET | /transfers | قائمة تحويلاتي (cursor-based) + فلاتر العملة/الحالة/الفترة | Bearer | عميل | MVP |

ملاحظات العقد: EP-TRF-03 يقبل `note` اختيارية تظهر للمستلم (FR-TRF-006) ويقبل quote_id كتلميح فقط — الرسوم النهائية خادمية (R-10). الفشل قبل التنفيذ لا يترك أي أثر مالي (Rollback كامل — AC-02).

---

# 8. المفضلون (EP-FAV)

**الوحدة المالكة:** identity (تخزين favorites ضمن نطاق الهوية) — **المرتبطة:** transfers (الاستخدام الأساسي عند التحويل — FR-FAV-003). الحد الأقصى سياسة مركزية (FR-FAV-004، مثل 50).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-FAV-01 | GET | /favorites | قائمة المفضلين (الاسم المستعار + الرقم + العملة الافتراضية) مرتبة بالأكثر استخداماً | Bearer | عميل | MVP |
| EP-FAV-02 | POST | /favorites | إضافة مفضل (بعد تحويل ناجح بضغطة واحدة أو من شاشة المفضلين — FR-FAV-002) | Bearer | عميل | MVP |
| EP-FAV-03 | PUT | /favorites/{id} | تعديل مفضل (الاسم المستعار/العملة الافتراضية) | Bearer | عميل | MVP |
| EP-FAV-04 | DELETE | /favorites/{id} | حذف مفضل | Bearer | عميل | MVP |
| EP-FAV-05 | PUT | /favorites/order | إعادة ترتيب المفضلين (قائمة معرّفات مرتبة) | Bearer | عميل | MVP |

---

# 9. الحوالات (EP-REM)

**الوحدة المالكة:** remittances (حوالة لغير مشترك، رمز تسليم، التسليم، الإلغاء/الانتهاء) — **المرتبطة:** transaction-engine (خصم ذرّي + Reversal عند الإلغاء — FR-REM-005/008)، cash-operations (تسليم الوكيل — EP-AGT)، notifications (SMS للمستلم عند الإنشاء — FR-REM-004). الحالات: `CREATED → PENDING_DELIVERY → DELIVERED → COMPLETED` (+ `EXPIRED/CANCELLED/REVERSED`).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-REM-01 | POST | /remittances | إنشاء حوالة لمستلم غير مشترك: المبلغ + العملة + بيانات المستلم (الاسم + الهاتف) + المدينة/الوكيل المقترح → يعيد رمز تسليم (رقمي + QR) يعمل مرة واحدة مع صلاحية زمنية قابلة للتهيئة (FR-REM-001/002) | Bearer + Idempotency-Key + PIN proof | عميل | MVP |
| EP-REM-02 | GET | /remittances/{id} | تتبع الحوالة: حالة حية + بيانات التسليم + المهلة المتبقية (FR-REM-004) | Bearer | عميل | MVP |
| EP-REM-03 | POST | /remittances/{id}/cancel | إلغاء حوالة غير مُسلَّمة واسترداد المبلغ للمحفظة عبر Reversal موثّق (FR-REM-005) | Bearer + Idempotency-Key + PIN proof | عميل | MVP |

ملاحظات العقد: الاستلام الوارد من شبكات صرافة (FR-REM-006) يصل عبر Webhook المزود (EP-HOOK) ويولّد إشعاراً فورياً — لا نقطة عميل له. انتهاء المهلة يرجع المبلغ تلقائياً وفق السياسة (FR-REM-008). رسوم الحوالة وعمولة الوكيل تُدار بقواعد مركزية وتُثبَّت داخل المعاملة (FR-REM-007).

---

# 10. السحب/الإيداع النقدي (EP-CWD)

**الوحدة المالكة:** cash-operations (طلبات الإيداع/السحب، Hold، رمز السحب) — **المرتبطة:** transaction-engine (الخصم/الإضافة عبر Ledger)، geo-eligibility (البحث عن الوكلاء ونقاط الخدمة)، notifications. حالات السحب: `CREATED → PENDING → AUTHORIZED → READY_FOR_COLLECTION → COLLECTED → COMPLETED` (+ رفض/انتهاء/إلغاء/عكس — ملحق أ).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-CWD-01 | POST | /cash/deposits | إنشاء طلب إيداع نقدي عبر وكيل (المبلغ/العملة/الوكيل) → حالة PENDING بانتظار تأكيد الوكيل بعد استلام النقد (FR-CWD-001، Master §21) | Bearer + Idempotency-Key | عميل | MVP |
| EP-CWD-02 | POST | /cash/withdrawals | إنشاء طلب سحب: خصم Hold على المبلغ (رصيد مجمّد) → يعيد رمز سحب + صلاحية زمنية (FR-CWD-002) | Bearer + Idempotency-Key + PIN proof | عميل | MVP |
| EP-CWD-03 | GET | /cash/deposits/{id} · /cash/withdrawals/{id} | حالة طلب الإيداع/السحب (رمز السحب + المهلة + الحالة الحية) — تُستخدم بعد انقطاع الشبكة (§67) | Bearer | عميل | MVP |
| EP-CWD-04 | POST | /cash/withdrawals/{id}/cancel | إلغاء السحب قبل التسليم → تحرير Hold فوراً (وإلا يحرَّر تلقائياً عند EXPIRED عبر Reversal + إشعار — FR-CWD-003) | Bearer + Idempotency-Key + PIN proof | عميل | MVP |
| EP-CWD-05 | GET | /agents/nearby?lat&lng&radius&currency | البحث عن الوكلاء ونقاط الخدمة الأقرب (فلاتر: العملة/الخدمة/الحالة/ساعات العمل — FR-CWD-004) | Bearer | عميل | MVP |
| EP-CWD-06 | GET | /agents/{id} | تفاصيل وكيل (ساعات العمل، الخدمات المتاحة، الحالة، الموقع) | Bearer | عميل | MVP |

ملاحظات العقد: الحد الأدنى/الأعلى للسحب والإيداع لكل عملة/مستوى KYC عبر محرك الحدود، والرسوم تُعرض قبل التأكيد (FR-CWD-005) — اقتباس الرسوم متاح عبر نمط Quote الموحد (§1.9) بذات مسار الخدمة. رفض الوكيل للإيداع يترك الحالة REJECTED بسبب مقنّن (FR-CWD-006).

---

# 11. الدفع والتاجر (EP-PAY)

**الوحدة المالكة:** merchant-payments (الدفع QR/POSCOF، وضع التاجر، تسويات التاجر) — **المرتبطة:** transaction-engine، wallet-core، notifications (إشعار الطرفين — FR-PAY-003)، identity (حل التاجر). الخادم **يفك توقيع QR ويتحقق** — لا ثقة بنص QR وحده (FR-PAY-001/007، R-10).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-PAY-01 | POST | /payments/qr/resolve | فك QR التاجر على الخادم: يتحقق من التوقيع/الإصدار/الانتهاء ويعيد التاجر + الفرع + النقطة + (مع amount: اقتباس الرسوم والإجمالي) — QR غير موقّع = رفض (FR-PAY-007) | Bearer | عميل | Beta |
| EP-PAY-02 | GET | /payments/pos/{code}?amount&currency | حل POSCOF (رقم نقطة البيع) يدوياً من الخادم + عرض اسم التاجر قبل التأكيد (FR-PAY-002) مع اقتباس الرسوم | Bearer | عميل | Beta |
| EP-PAY-03 | POST | /payments | تنفيذ الدفع للتاجر (Idempotency إلزامي): عرض التاجر+المبلغ+الرسوم ثم PIN → عملية ذرّية → إشعار وإيصال للطرفين (FR-PAY-003) | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-PAY-04 | GET | /pay-requests | صندوق طلبات الدفع الواردة (Push من تاجر — FR-PAY-004): القائمة + حالة كل طلب | Bearer | عميل | Beta |
| EP-PAY-05 | POST | /pay-requests/{id}/respond | قبول أو رفض طلب الدفع؛ القبول (مع PIN proof) ينفّذ الدفع عبر EP-PAY-03 نفسه كعملية ذرّية | Bearer + Idempotency-Key + PIN proof | عميل | Beta |

ملاحظات العقد: إنشاء طلب الدفع من جهة التاجر هو `POST /merchant/pay-requests` (ملكية المورد: merchant-payments — موثّق في EP-MRC-04؛ لا تكرار ملكية). الإصدار الديناميكي للـ QR للتاجر في EP-MRC-02. تجار بفروع ونقاط متعددة (merchant → branches → terminals — FR-PAY-005) تدار من لوحة الإدارة (EP-ADM).

---

# 12. شحن رصيد الجوال (EP-TOP)

**الوحدة المالكة:** topup (الشبكات، المنتجات، الشحن) — **المرتبطة:** provider-adapters (طلب المزود + سياسة الفشل §69)، transaction-engine (خصم ذرّي قبل طلب المزود). **لا نجاح إلا بنتيجة المزود الفعلية** — الحالة Pending معلنة بوضوح (FR-TOP-004).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-TOP-01 | GET | /topup/networks | الشبكات المفعلة (اسم/شعار/تفعيل — كيان إداري مُدار) | Bearer | عميل | Beta |
| EP-TOP-02 | GET | /topup/networks/{id}/products | منتجات الشبكة (فئة/باقة/سعر/تفعيل — FR-TOP-003) | Bearer | عميل | Beta |
| EP-TOP-03 | POST | /topups | تنفيذ شحن لرقم المستخدم أو رقم آخر (تحقق صيغة الرقم/الشبكة — FR-TOP-002)؛ الحالة Pending (PROCESSING) حتى نتيجة المزود | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-TOP-04 | GET | /topups/{id} | حالة الشحن (PROCESSING/COMPLETED/FAILED/REVERSED) — تُستخدم بعد انقطاع الشبكة (§67) وعند اكتمال نتيجة المزود | Bearer | عميل | Beta |
| EP-TOP-05 | GET/DELETE | /topup/recent-numbers[/{id}] | آخر الأرقام المشحونة (سجل سريع — FR-TOP-006) وحذف رقم منها | Bearer | عميل | Beta |

ملاحظات العقد: إعادة المحاولة الآمنة عبر Idempotency عند انقطاع الاتصال بالمزود مع استرجاع تلقائي وفق السياسة (FR-TOP-005 — لا Retry أعمى §70). فشل المزود بعد الخصم = لا خصم غير مفسَّر: Pending → Retry/Reverse/Refund (§69).

---

# 13. الفواتير (EP-BIL)

**الوحدة المالكة:** bills (المزودون، الاستعلام، السداد، سياسة الفشل) — **المرتبطة:** provider-adapters (inquiry/pay/status)، transaction-engine. المزودون والمنتجات كيانات مُدارة (bill_providers/bill_products) بتفعيل فردي (FR-BIL-003).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-BIL-01 | GET | /bills/providers | قائمة مزودي الخدمة المفعّلين ومنتجاتهم (إنترنت/هاتف/خدمات) | Bearer | عميل | Beta |
| EP-BIL-02 | POST | /bills/inquiry | استعلام فاتورة: المزود + رقم المشترك → المستحق + تاريخ الاستحقاق (+ مرجع الاستعلام) — لا سماح بتعديل المستحق دون قاعدة صريحة (FR-BIL-001/002) | Bearer | عميل | Beta |
| EP-BIL-03 | POST | /bills/payments | تنفيذ سداد الفاتورة (Idempotency إلزامي) — نتيجة واضحة دوماً في السجل مع إيصال (FR-BIL-004) | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-BIL-04 | GET/POST/DELETE | /bills/payers[/{id}] | الممولون المحفوظون (أرقام المشتركين المتكررة للسداد السريع — FR-BIL-005): قائمة/إضافة/حذف | Bearer | عميل | Beta |

ملاحظات العقد: فشل المزود بعد الخصم: Pending → Retry → Refund مع إشعار المستخدم وحالة معلنة في السجل (FR-BIL-004، AC-08). حالة السداد تُتابع عبر `GET /transactions/{id}` (EP-STM-02) أو إعادة إرسال نفس الطلب بنفس Idempotency-Key.

---

# 14. كروت الشبكة (EP-NWC)

**الوحدة المالكة:** network-cards (المخزون المُدار مركزياً، البيع: حجز ثم تسليم) — **المرتبطة:** transaction-engine. **الكود يُسلَّم فقط بعد نجاح الدفع** — فشل الدفع = لا استهلاك للكرت (FR-NWC-002، Master §32).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-NWC-01 | GET | /network-cards/catalog | كتالوج الكروت المتاحة (شبكة/فئة/سعر/توفر) من المخزون المُدار | Bearer | عميل | Beta |
| EP-NWC-02 | POST | /network-cards/purchases | شراء كرت (Idempotency إلزامي): خصم → حجز الكرت → تسليم الكود بعد نجاح الدفع فقط | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-NWC-03 | GET | /network-cards/purchases/{id}/code | إعادة عرض كود عملية سابقة ضمن صلاحية العرض الأمنية (بعد PIN proof — FR-NWC-003) | Bearer + PIN proof | عميل | Beta |

---

# 15. الحصالة (EP-SAV)

**الوحدة المالكة:** savings (أهداف الادخار، إيداع/سحب عبر Ledger فعلي) — **المرتبطة:** wallet-core (حساب SAVING في دليل الحسابات)، transaction-engine. الحصالة **محفظة ادخار داخلية وليست رقماً وهمياً** (Master §31، FR-SAV-002).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-SAV-01 | GET | /savings/goals | أهدافي (عنوان/مستهدف/حالي/عملة/تاريخ الهدف/حالة) + التقدم والإحصاءات (FR-SAV-004) | Bearer | عميل | Beta |
| EP-SAV-02 | POST | /savings/goals | إنشاء هدف ادخار (متعددة — FR-SAV-001) | Bearer | عميل | Beta |
| EP-SAV-03 | PUT/DELETE | /savings/goals/{id} | تعديل هدف / حذف هدف (الحذف يتطلب تصفية رصيد الهدف أولاً) | Bearer | عميل | Beta |
| EP-SAV-04 | POST | /savings/goals/{id}/deposit | إيداع في الحصالة من المحفظة الرئيسية — عبر Ledger فعلي (Idempotency إلزامي) | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-SAV-05 | POST | /savings/goals/{id}/withdraw | سحب من الحصالة إلى المحفظة — نفس المبدأ بالاتجاه المعاكس (Idempotency إلزامي) | Bearer + Idempotency-Key + PIN proof | عميل | Beta |
| EP-SAV-06 | GET | /savings/transactions | سجل عمليات الحصالة منفصل ومفصل (FR-SAV-006) — cursor-based | Bearer | عميل | Beta |

---

# 16. السجل والكشوف (EP-STM)

**الوحدة المالكة:** statements (السجل، الفلاتر، الإيصال، كشف PDF) — **المرتبطة:** wallet-core وtransaction-engine (قراءة فقط)، support (تذكرة مرتبطة بالعملية — §106، Master §107).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-STM-01 | GET | /transactions | سجل عملياتي المفصل: فلاتر النوع/العملة/الحالة/الفترة (اليوم/7/30/مخصصة) + البحث بالمرجع `SW-...` أو الطرف + `?limit&cursor` إلزامي (FR-STM-001..003، 006) | Bearer | عميل | MVP |
| EP-STM-02 | GET | /transactions/{id} | تفاصيل العملية: كل بيانات الإيصال (الرصيد قبل/بعد، الأطراف، الرسوم بلقطتها) + زر الإبلاغ (FR-STM-004) | Bearer | عميل | MVP |
| EP-STM-03 | GET | /transactions/{id}/receipt | إيصال العملية القابل للمشاركة (JSON + نسخة PDF موقّعة بالمرجع) — لا يحتوي PIN أبداً (FR-TRF-005، Master §60) | Bearer | عميل | MVP |
| EP-STM-04 | GET | /statements?from&to&currency | كشف حساب PDF (موقَّع بمرجع) بفلاتر الفترة/العملة (FR-STM-005) | Bearer | عميل | MVP |
| EP-STM-05 | POST | /transactions/{id}/report | الإبلاغ عن مشكلة من شاشة العملية → ينشئ تذكرة مرتبطة مباشرة بالعملية (يغني المستخدم عن كتابة المرجع — §106) | Bearer | عميل | MVP |
| EP-STM-06 | GET | /transactions/{id}/whatsapp-link | رابط WhatsApp مُهيّأ: رسالة تحتوي المرجع والبيانات المسموحة فقط — لا PIN ولا أسرار (FR-SUP-004، Master §107) | Bearer | عميل | MVP |

---

# 17. الإشعارات (EP-NTF)

**الوحدة المالكة:** notifications (القوالب i18n، القنوات FCM/SMS/In-App، Deep Links، التفضيلات) — **المرتبطة:** كل الوحدات كمستهلك أحداث بعد Commit. **Push قناة إبلاغ فقط — فشلها لا يعني فشل العملية (R-13، FR-NTF-007).**

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-NTF-01 | GET | /notifications | مركز الإشعارات: قائمة (مقروء/غير مقروء + pagination cursor) — أنواع Transaction/Security/KYC/System/Marketing/Support | Bearer | عميل | MVP |
| EP-NTF-02 | POST | /notifications/{id}/read · /notifications/read-all | تعليم إشعار مقروءاً أو تعليم الكل (حذف منطقي للعرض) | Bearer | عميل | MVP |
| EP-NTF-03 | GET/PUT | /notifications/preferences | تفضيلات الإشعارات (أنواع قابلة للإيقاف عدا المالية والأمنية + اللغة — FR-NTF-005) | Bearer | عميل | MVP |
| EP-NTF-04 | POST | /notifications/push-tokens | تسجيل/تحديث Push Token (FCM) لكل جهاز (يُلغى عند logout — FR-NTF-001) | Bearer | عميل | MVP |

ملاحظات العقد: كل إشعار يحمل `deep_link` صحيحاً (مثل `swallet://transaction/SW-20260911-XXXXXXXX` أو `swallet://kyc`) — الإشعار لا يفتح شاشة بلا سياق (FR-NTF-004، Master §55). Deep Links موثقة في معمارية Flutter §4.5.

---

# 18. الدعم (EP-SUP)

**الوحدة المالكة:** support (التذاكر، المحادثة، الربط بالمعاملة، تقييم الرضا) — **المرتبطة:** statements/transaction-engine (قراءة العملية المرتبطة)، content-config (FAQ/المقالات/رقم الدعم القابل للتحديث — FR-SUP-005)، notifications. حالات التذكرة: `OPEN → IN_PROGRESS → WAITING_USER → RESOLVED → CLOSED`.

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-SUP-01 | GET | /support/faq | مركز المساعدة: تصنيفات FAQ ومقالاتها (مُدارة من Content Admin — FR-SUP-001) | Bearer | عميل | MVP |
| EP-SUP-02 | GET | /support/tickets | تذاكري (الحالة/الفئة/آخر تحديث) — cursor | Bearer | عميل | MVP |
| EP-SUP-03 | POST | /support/tickets | تذكرة جديدة: فئة + وصف + مرفقات (اختياري) + ارتباط مباشر بالعملية عند الإبلاغ منها (FR-SUP-002، §106) | Bearer | عميل | MVP |
| EP-SUP-04 | GET/POST | /support/tickets/{id}/messages | محادثة التذكرة (رسائل ذهاب/عودة): GET برسائل مرقّمة cursor — polling من العميل حالياً (تقنية realtime مستقبلية: SSE/WebSocket عند توفرها)؛ POST رسالة/رد بالمرفقات | Bearer | عميل | MVP |
| EP-SUP-05 | POST | /support/attachments/upload-requests | طلب رفع مرفق → URL موقّع مؤقت (لا رفع مباشر عبر API) | Bearer | عميل | MVP |
| EP-SUP-06 | POST | /support/tickets/{id}/rating | تقييم رضا بعد إغلاق التذكرة (FR-SUP-006) | Bearer | عميل | Beta |

---

# 19. الحساب والإعدادات (EP-ACC)

**الوحدة المالكة:** identity (الملف، التفضيلات، إغلاق الحساب) — **المرتبطة:** kyc (عرض مستوى التوثيق)، notifications (تنبيهات التغييرات الأمنية)، statements (تصفية الرصيد عند الإغلاق — AC-11).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-ACC-01 | GET/PUT | /account/profile | بياناتي (الاسم، الصورة، الهاتف [غير قابل للتعديل إلا عبر EP-ACC-03]، المنطقة، مستوى KYC، التفضيلات) / تحديث الملف (FR-ACC-001) | Bearer | عميل | MVP |
| EP-ACC-02 | PUT | /account/settings | تغيير اللغة (ar/en) / الثيم / إخفاء الرصيد / تفعيل 2FA للعمليات الحساسة (FR-ACC-002/006، FR-AUTH-013) | Bearer | عميل | MVP |
| EP-ACC-03 | POST | /account/phone-change | تغيير رقم الهاتف: OTP للرقم القديم + OTP للرقم الجديد + مراجعة أمنية (FR-ACC-003) | Bearer + OTP×2 | عميل | MVP |
| EP-ACC-04 | POST | /account/close | طلب إغلاق الحساب: يُرفض وجودُ رصيد قائم حتى تصفيته (سحب/تحويل) ثم إلغاء الجلسات → CLOSED مع الاحتفاظ بالسجلات المالية المطلوبة للتدقيق وإخفاء البيانات الشخصية حيث يجوز (FR-ACC-004، AC-11، Master §91) | Bearer + PIN proof | عميل | MVP |

---

# 20. وضع الوكيل (EP-AGT)

**الوحدة المالكة:** cash-operations (طابور الوكيل، تنفيذ الإيداع/السحب، Float، التسوية) — **المرتبطة:** remittances (تسليم الحوالات)، transaction-engine، reconciliation (التسوية اليومية)، fees (عمولات الوكيل agent_fee_rules). التوثيق: نفس Bearer لكن بحساب وكيل مفعّل (`agents.status = ACTIVE`) — صلاحيات الوكيل تُفرض في Guard مستقل.

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-AGT-01 | GET | /agent/queue | طابور طلبات اليوم: الإيداعات المعلقة / السحوبات الجاهزة للتسليم (READY_FOR_COLLECTION) / الحوالات للتسليم (PENDING_DELIVERY) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-02 | POST | /agent/deposits/{id}/confirm | تنفيذ إيداع بعد استلام النقد فعلياً → تحقق الخادم → Ledger → إشعار المستخدم (FR-CWD-001) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-03 | POST | /agent/deposits/{id}/reject | رفض طلب إيداع بسبب مقنّن → REJECTED (FR-CWD-006) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-04 | POST | /agent/withdrawals/{id}/deliver | تنفيذ تسليم سحب: تحقق رمز السحب + هوية المستلم (نوع/رقم الهوية) → تسليم النقد وإتمام العملية (FR-CWD-002) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-05 | POST | /agent/remittances/{id}/deliver | تسليم حوالة: تحقق رمز التسليم + هوية المستلم → تسليم النقد وتسجيل التسليم (FR-REM-003) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-06 | GET | /agent/float | عوّامة Float الوكيل لكل عملة (رصيد التشغيل النقدي — Master §100) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-07 | GET | /agent/settlement/today | تسوية اليوم: Cash In/Out، العمولات المستحقة، الفروقات (FR-CWD-007، FR-ADM-018) | Bearer (وكيل) | وكيل | MVP |
| EP-AGT-08 | GET | /agent/commissions | عمولاتي (المستحقة/المسددة) لكل فترة | Bearer (وكيل) | وكيل | MVP |

ملاحظات العقد: كل عمليات الوكيل (Cash In/Out) تنعكس فوراً على Float وتظهر في تسويته اليومية (FR-CWD-007). نضوب Float يمنع تنفيذ السحب برمز واضح (`ERR_TRF_*` من عائلة الخدمة) مع تنبيه الإدارة (RK-05).

---

# 21. وضع التاجر (EP-MRC)

**الوحدة المالكة:** merchant-payments (وضع التاجر: QR الديناميكي، المدفوعات الواردة، طلبات الدفع، التسويات) — **المرتبطة:** transaction-engine، notifications (إشعار الدفع الوارد)، reconciliation (تسويات التاجر merchant_settlements). التوثيق: Bearer بحساب تاجر مربوط بنقطة بيع/فرع.

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-MRC-01 | GET | /merchant/dashboard | لوحة التاجر: مبيعات اليوم/الفترة، عدد العمليات، متوسط القيمة (لكل فرع/نقطة) | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-02 | POST | /merchant/dynamic-qr | إصدار QR ديناميكي موقّع بمبلغ محدد وTTL (يوقَّع ويولَّد خادمياً — لا توليد محلي) | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-03 | GET | /merchant/payments | المدفوعات الواردة (cursor) + فلاتر الفرع/النقطة/الفترة | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-04 | POST | /merchant/pay-requests | طلب دفع مباشر لعميل حاضر عبر Push (يصل EP-PAY-04 للعميل) — **ملكية المورد: merchant-payments** (مكرر في EP-PAY للسياق فقط، لا ملكية مزدوجة) | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-05 | GET | /merchant/pay-requests/{id} | حالة طلب الدفع: (بانتظار العميل/مقبول→معاملة/مرفوض/منتهي) | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-06 | GET | /merchant/settlements | تسويات التاجر (فورية/دورية بحسب سياسة التاجر — FR-PAY-006) + كشف مفصل + عمولة التاجر | Bearer (تاجر) | تاجر | Beta |
| EP-MRC-07 | GET | /merchant/branches/sales | مبيعات الفروع ونقاط البيع (تقارير مبيعية لكل نقطة) | Bearer (تاجر) | تاجر | Beta |

---

# 22. لوحة الإدارة (EP-ADM)

**الوحدة المالكة:** administration (RBAC، المستخدمون، الإجراءات، Maker-Checker) — **المرتبطة:** كل الوحدات عبر واجهاتها الإدارية + audit (كل إجراء حساس بسبب + Audit — FR-ADM-003). التوثيق: جلسة إدارية منفصلة (admin_users/admin_sessions) + **MFA إلزامي** (TOTP) + قيود IP اختيارية. عمود "الصلاحية المطلوبة" من نموذج Role → Permission → Scope.

**قواعد ثابتة للمجموعة كلها:** (1) البحث الموحد عبر `GET /admin/search` (§61) يخدم قوائم المستخدمين/الوكلاء/التجار/المعاملات بمنطق واحد. (2) كل إجراء حساس: تأكيد + سبب إلزامي + Audit؛ وبعضها موافقة ثانية (Maker-Checker — ERR_ADM_SECOND_APPROVAL_REQUIRED). (3) لا مسار `set balance` في أي endpoint حتى لـ Super Admin (R-05) — كل تعديل مالي عبر Adjustment Request. (4) التقارير كلها قراءة فقط.

| ID | Method | المسار | الغرض | التوثيق | الصلاحية المطلوبة | المرحلة |
|---|---|---|---|---|---|---|
| EP-ADM-01 | POST | /admin/auth/login | دخول الإدارة: بيانات قوية + قفل المحاولات → تحدي MFA | عام إداري | الإدارة (كل الأدوار) | MVP |
| EP-ADM-02 | POST | /admin/auth/mfa/verify | إكمال TOTP وإصدار جلسة إدارية (التحديث/الإلغاء بأنماط EP-AUTH-06/07 لعائلة admin_sessions) | تحدي MFA | الإدارة (كل الأدوار) | MVP |
| EP-ADM-03 | GET | /admin/dashboard | مؤشرات حية من طبقة البيانات الفعلية: المستخدمون النشطون، إجمالي الأرصدة، إيداعات/سحوبات/تحويلات/رسوم اليوم، المعلقة، الفاشلة، المجمّدة، KYC قيد المراجعة، تنبيهات احتيال، صحة النظام (§48، FR-ADM-005..007) | Bearer إداري + MFA | كل الأدوار (قراءة) | MVP |
| EP-ADM-04 | GET | /admin/search | البحث المركزي الموحد (§61): هاتف/معرّف مستخدم/معرّف عملية/مرجع SW/تاجر/وكيل/تاريخ/حالة — بمنطق واحد لكل الشاشات (FR-ADM-008) | Bearer إداري + MFA | وفق Scope الدور | MVP |
| EP-ADM-05 | GET | /admin/users/{id} | ملف المستخدم 360°: البيانات/الحالة/KYC/الأجهزة/الجلسات/المحافظ/العمليات/التذاكر (+ POST /admin/users/{id}/notes للملاحظات الإدارية) (FR-ADM-009) | Bearer إداري + MFA | Operations/Security/Support | MVP |
| EP-ADM-06 | POST | /admin/users/{id}/freeze | تجميد بسبب إلزامي (والرفع عبر unfrozen=false بسبب كذلك) + إنهاء الجلسات؛ التجميد الطويل يتطلب موافقة ثانية (+ حظر جهاز عبر POST .../devices/{deviceId}/ban) (FR-ADM-010) | Bearer إداري + MFA + سبب | Operations/Security | MVP |
| EP-ADM-07 | GET | /admin/kyc/queue | طابور مراجعة KYC: أولويات/أعمار/SLA مرئي/تعيين للمدققين (FR-ADM-012) | Bearer إداري + MFA | Security | MVP |
| EP-ADM-08 | GET | /admin/kyc/{profileId} | شاشة مراجعة: بيانات المستخدم + إشارات المخاطر + سجل المحاولات (المستندات بروابط موقّعة تُطلب عبر POST /admin/kyc/documents/{id}/signed-url — صلاحية مدقق KYC فقط) (FR-ADM-013، FR-KYC-006) | Bearer إداري + MFA | Security | MVP |
| EP-ADM-09 | POST | /admin/kyc/{profileId}/decision | قرار: قبول (بمستوى) / رفض (سبب مقنّن) / طلب تحديث — مع فحص قوائم AML قبل الاعتماد (FR-ADM-014/015) | Bearer إداري + MFA + سبب | Security | MVP |
| EP-ADM-10 | GET/PUT | /admin/agents/{id} | ملف وكيل وتحديثه: البيانات/الحالة (ACTIVE/SUSPENDED/BLOCKED)/نقاط الخدمة/الحدود (يومي-شهري)/قواعد العمولات/Float (+ التسويات عبر ?include=settlements) (FR-ADM-016/018/019/020) | Bearer إداري + MFA (+ سبب للتحديث) | Operations/Finance | MVP |
| EP-ADM-11 | POST | /admin/agents/{id}/float-adjust | تغذية/تقليص Float عبر عملية مالية موثّقة (Adjustment + Ledger + Audit) — ليست تعديلاً مباشراً (FR-ADM-017، R-05) | Bearer إداري + MFA + سبب + موافقة ثانية | Finance | MVP |
| EP-ADM-12 | GET | /admin/merchants/{id} | ملف تاجر: فروع/نقاط بيع/QR/عمولة/حدود الدفع/سياسة التسوية (+ كشوف التسوية عبر ?include=settlements) (FR-ADM-021..023) | Bearer إداري + MFA | Operations/Finance | MVP |
| EP-ADM-13 | POST/PUT | /admin/merchants | إنشاء/تحديث تاجر و فروعه ونقاطه (QR يولَّد ويوقَّع خادمياً لكل نقطة) + تفعيل/تعليق (FR-ADM-021/022) | Bearer إداري + MFA + سبب | Operations | MVP |
| EP-ADM-14 | GET | /admin/transactions/{id} | تفاصيل معاملة + تاريخ الحالة + الأطراف (قيود الدفتر للمحاسبين عبر ?include=ledger_entries) | Bearer إداري + MFA | Operations/Support/Finance | MVP |
| EP-ADM-15 | GET | /admin/pending-transactions | قائمة المعاملات المعلقة: العملية/السبب/العمر/المزود/الحالة/آخر Retry (§105، FR-ADM-034) | Bearer إداري + MFA | Operations/Finance | MVP |
| EP-ADM-16 | POST | /admin/pending-transactions/{id}/actions | الإجراء الذي تسمح به السياسة: Retry (مشروط §70) / Cancel / Reverse (R-04) — لا زر "Complete" عشوائي | Bearer إداري + MFA + سبب (+ موافقة ثانية للعكس) | Operations/Finance | MVP |
| EP-ADM-17 | GET/POST/PUT | /admin/fee-rules | قواعد الرسوم CRUD بكل الأبعاد (خدمة/عملة/مستوى/منطقة/مدى مبلغ/ثابت-نسبة بحد أدنى وأقصى) + فترة سريان + إصدارات + معاينة قبل النشر — المعاملات القديمة تحتفظ بلقطة رسومها (FR-ADM-024، §37) | Bearer إداري + MFA + سبب (+ موافقة ثانية) | Finance | MVP |
| EP-ADM-18 | GET/POST/PUT | /admin/limit-rules | قواعد الحدود CRUD بكل الأبعاد + اختبار "ماذا لو" قبل النشر (FR-ADM-025) | Bearer إداري + MFA + سبب (+ موافقة ثانية) | Finance | MVP |
| EP-ADM-19 | GET/PUT/POST | /admin/currencies · /admin/fx-rates | العملات: تفعيل/تعطيل + سماح كل عملية (إيداع/سحب/تحويل)؛ وأسعار الصرف: أزواج/سعر شراء-بيع/هامش/تاريخ السريان (FR-ADM-026/027، FR-WLT-006) | Bearer إداري + MFA + سبب | Finance | MVP |
| EP-ADM-20 | GET/POST | /admin/adjustment-requests | قائمة/إنشاء طلب تعديل مالي: مبلغ + سبب + مرجع (Maker — FR-ADM-029، R-05) | Bearer إداري + MFA + سبب | Finance/Operations | MVP |
| EP-ADM-21 | POST | /admin/adjustment-requests/{id}/decision | الاعتماد الثاني أو الرفض (Checker) → ينفّذ معاملة Ledger عادية + Audit — لا تعديل رصيد مباشر أبداً (FR-ADM-029، Master §141) | Bearer إداري + MFA + سبب | صلاحية اعتماد مستقلة عن Maker | MVP |
| EP-ADM-22 | POST/GET | /admin/reconciliation/runs | تشغيل مطابقة (Job) + النتائج و RECONCILIATION_ALERT (رصيد المحفظة مقابل Ledger — انحراف = تنبيه لا حذف) (FR-ADM-028، FR-LDG-010، AC-10) | Bearer إداري + MFA | Finance/Auditor | MVP |
| EP-ADM-23 | GET/POST/PUT | /admin/regions | المناطق والأهلية: قائمة المناطق/المديريات + تفعيل + سياسات (سماح تسجيل/معاملات) دون إصدار جديد (FR-GEO-001/002) | Bearer إداري + MFA + سبب | Operations | MVP |
| EP-ADM-24 | GET/PUT | /admin/services · /admin/feature-flags | حالات الخدمة لكل خدمة: ON/OFF/MAINTENANCE (الخادم يمنع الجديد فوراً — §96)؛ والأعلام المركزية (crypto_enabled/savings_enabled/qr_enabled...) ضمن حدود §98: تحكم فقط لا منطق مالي موازٍ (FR-ADM-037/038) | Bearer إداري + MFA (+ سبب للحالات) | Operations؛ Flags: Super/Content | MVP |
| EP-ADM-25 | GET/POST/PUT | /admin/content | إدارة المحتوى: بانرات/FAQ/مقالات/شروط/خصوصية/أوصاف الخدمات/إعلانات — بفصل كامل عن الكود (FR-ADM-039، §53) | Bearer إداري + MFA | Content | MVP |
| EP-ADM-26 | POST | /admin/notifications/broadcast | إشعار جماعي/مستهدف بالأنواع واللغات مع Deep Link ومعاينة قبل الإرسال (FR-ADM-042) | Bearer إداري + MFA | Content/Support | MVP |
| EP-ADM-27 | GET/PUT | /admin/app-versions · /admin/settings | إدارة الإصدارات android/ios (latest/minimum/force_update/release_notes/store_url — §52)؛ والإعدادات العامة/Remote Config (support_number، currency_visibility، maintenance_state، minimum_version — حدود §97/§98) (FR-ADM-040، FR-ADM-041) | Bearer إداري + MFA | Content/Super | MVP |
| EP-ADM-28 | GET | /admin/reports | تقارير: مستخدمون/مالية/عمليات/مناطق (+ أداء المزودين والخريطة الساخنة للمناطق FR-GEO-015) — قراءة فقط + تصدير CSV مع pagination (FR-ADM-043..047) | Bearer إداري + MFA | كل الأدوار وفق Scope | MVP |
| EP-ADM-29 | GET | /admin/audit-logs | سجل التدقيق: فلاتر (الفاعل/الدور/الإجراء/الهدف/الفترة) + تصدير — غير قابل للتعديل أو الحذف (FR-ADM-048..050، R-14) | Bearer إداري + MFA | Auditor (+Security) | MVP |
| EP-ADM-30 | GET/POST/PUT | /admin/roles | الأدوار والصلاحيات: إنشاء/تحديث أدوار وتعيين صلاحيات بمدى Scope (GLOBAL/REGION/ENTITY) (+ إنشاء مستخدمي الإدارة وتعيين أدوارهم عبر POST /admin/admin-users — MFA مفعّل إلزاماً) (FR-ADM-001) | Bearer إداري + MFA | Super Admin | MVP |

ملاحظات العقد للحسابات الإدارية: مخاطر حالات الأمن (FR-ADM-035/036: أحداث دخول جهاز جديد، محاولات PIN، Spoofing/VPN/محاكي) تُعرض ضمن مسارات القراءة أعلاه (Dashboard/Search/ملف المستخدم) — كل قرار مبني على إشاراته المسجلة. حالات النظام (ACTIVE/MAINTENANCE/READ_ONLY/...) تُدار ضمن EP-ADM-27 وتُقرأ من Bootstrap (FR-ADM-041).

---

# 23. Webhooks المزودين (EP-HOOK)

**الوحدة المالكة:** provider-adapters (استقبال أحداث المزودين، Idempotent بالمعرف الخارجي، تسجيل provider_webhook_events) — **المرتبطة:** topup (نتائج الشحن)، bills (نتائجة الفواتير)، remittances (حوالة واردة من شبكة صرافة)، notifications، reconciliation.

**قواعد الحماية:** توقيع HMAC-SHA256 على الجسم الخام في رأس `X-Signature` + `X-Timestamp` (نافذة ±5 دقائق ضد Replay)؛ Idempotent بالمعرف الخارجي (نفس event_id = 200 تجاهل دون تنفيذ مزدوج)؛ لا تنفيذ مالي مباشر من الـ Webhook — الحدث يمر بمحرك المعاملات كأي طلب داخلي (R-03/§125).

| ID | Method | المسار | الغرض | التوثيق | الدور/الصلاحية | المرحلة |
|---|---|---|---|---|---|---|
| EP-HOOK-01 | POST | /webhooks/providers/{provider} | أحداث المزودين: نتيجة شحن (`topup.result`)، نتيجة فاتورة (`bill.result`)، حوالة واردة من شبكة صرافة (`remittance.inbound` — تدفع للمحفظة مباشرة بمرجع خارجي + إشعار فوري، FR-REM-006) | توقيع HMAC (X-Signature) | مزود خارجي | MVP |

ملاحظات العقد: ردّ 200 يعني "استُلم وحُفظ" لا "نُفِّذ" — نتيجة التنفيذ تظهر في المعاملة عبر polling المزود أو أحداث لاحقة (§69). الحدث غير المطابق (مبلغ/مرجع) ينتج حالة مراجعة لا نجاحاً صامتاً (R-08).

---

# 24. أمثلة تفصيلية (JSON)

أمثلة كاملة (طلب + استجابة ناجحة + استجابة فشل) للعمليات الأهم. القيم توضيحية للعقد فقط.

## 24.1 طلب OTP للتسجيل — `POST /auth/register/request-otp`

الطلب:

```json
POST /v1/auth/register/request-otp
X-Device-Id: 7f9c2c1e-5b4a-4e2d-9f1a-3c8d7b6a5e4f
X-App-Version: 1.4.2
X-App-Platform: android
Accept-Language: ar

{
  "phone": "772123456",
  "region_code": "AD"
}
```

الاستجابة الناجحة (201):

```json
{
  "success": true,
  "data": {
    "phone": "772123456",
    "expires_in": 300,
    "resend_after": 60,
    "attempts_left": 5
  },
  "meta": { "request_id": "req_01J8ZOTP01" }
}
```

الاستجابة الفاشلة (403) — التسجيل من منطقة غير مفتوحة (FR-GEO-003):

```json
{
  "success": false,
  "error": {
    "code": "ERR_GEO_REGION_CLOSED",
    "message": "التسجيل غير متاح في منطقتك حالياً",
    "context": { "region_code": "LA", "allow_registration": false }
  },
  "meta": { "request_id": "req_01J8ZOTP02" }
}
```

## 24.2 تنفيذ تحويل — `POST /transfers` (بكل المعاملات الحساسة)

الطلب (لاحظ: `Idempotency-Key` إلزامي + `pin_proof` من EP-AUTH-10):

```json
POST /v1/transfers
Authorization: Bearer eyJhbGciOi...
X-Device-Id: 7f9c2c1e-5b4a-4e2d-9f1a-3c8d7b6a5e4f
X-App-Version: 1.4.2
X-App-Platform: android
Accept-Language: ar
Idempotency-Key: 9c1d2f3a-7777-4bbb-9ccc-0000aaaa1111

{
  "beneficiary_phone": "773654321",
  "currency": "YER",
  "amount": "50000.00",
  "quote_id": "qte_01J8ZQUOTE9",
  "note": "قسط الشهر",
  "pin_proof": "ppt_01J8ZPIN009F"
}
```

الاستجابة الناجحة (201) — الخادم أعاد حساب الرسوم وخصم الإجمالي (لا العميل):

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "txn_01J8ZK3M2Q",
      "reference": "SW-20260911-8F3K2Q9A",
      "type": "TRANSFER",
      "status": "COMPLETED",
      "amount": "50000.00",
      "fee": "250.00",
      "total": "50250.00",
      "currency": "YER",
      "created_at": "2026-09-11T10:32:11+03:00",
      "completed_at": "2026-09-11T10:32:12+03:00"
    },
    "sender_new_balance": { "currency": "YER", "available": "149750.00" },
    "receipt_url": "/v1/transactions/txn_01J8ZK3M2Q/receipt"
  },
  "meta": { "request_id": "req_01J8ZTRF77" }
}
```

الاستجابة الفاشلة (422) — رصيد غير كافٍ (AC-02: لا حركة Ledger ولا رصيد):

```json
{
  "success": false,
  "error": {
    "code": "ERR_TRF_INSUFFICIENT_BALANCE",
    "message": "الرصيد غير كافٍ لإتمام العملية",
    "context": { "available": "45000.00", "required": "50250.00", "currency": "YER" }
  },
  "meta": { "request_id": "req_01J8ZTRF78" }
}
```

تكرار نفس الطلب بنفس `Idempotency-Key` (نفس المفتاح = نفس النتيجة — §16): يعاد **نفس الكائن** مع `"idempotent_replay": true` في `meta` ولا يُنفَّذ خصم ثانٍ.

## 24.3 حالة تحويل بعد انقطاع الشبكة — `GET /transfers/{id}` (§67، AC-04)

الطلب:

```json
GET /v1/transfers/txn_01J8ZK3M2Q
Authorization: Bearer eyJhbGciOi...
X-Device-Id: 7f9c2c1e-...
X-App-Version: 1.4.2
X-App-Platform: android
Accept-Language: ar
```

الاستجابة الناجحة (200) — العملية الأصلية نفسها تُستعلم ولا يُنشأ طلب جديد:

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "txn_01J8ZK3M2Q",
      "reference": "SW-20260911-8F3K2Q9A",
      "type": "TRANSFER",
      "status": "COMPLETED",
      "amount": "50000.00",
      "fee": "250.00",
      "total": "50250.00",
      "currency": "YER",
      "status_history": [
        { "status": "CREATED", "at": "2026-09-11T10:32:10+03:00" },
        { "status": "COMPLETED", "at": "2026-09-11T10:32:12+03:00" }
      ]
    }
  },
  "meta": { "request_id": "req_01J8ZSTS41" }
}
```

الاستجابة الفاشلة (404) — الطلب الأصلي لم يصل الخادم أبداً (آمن إنشاء طلب جديد بمفتاح Idempotency جديد):

```json
{
  "success": false,
  "error": {
    "code": "ERR_TXN_NOT_FOUND",
    "message": "العملية غير موجودة",
    "context": { "id": "txn_01J8ZK9Z9" }
  },
  "meta": { "request_id": "req_01J8ZSTS42" }
}
```

## 24.4 تنفيذ شحن رصيد (Pending) — `POST /topups`

الطلب:

```json
POST /v1/topups
Authorization: Bearer eyJhbGciOi...
X-Device-Id: 7f9c2c1e-...
X-App-Version: 1.4.2
X-App-Platform: android
Accept-Language: ar
Idempotency-Key: 55e6a7b8-4444-4ccc-8ddd-1111bbbb2222

{
  "network_id": "net_01J8YAM",
  "product_id": "prd_01J8Y5000YER",
  "phone": "772123456",
  "pin_proof": "ppt_01J8ZPIN010A"
}
```

الاستجابة الناجحة (201) — **لا نجاح إلا بنتيجة المزود** (FR-TOP-004): الخصم تم داخل معاملة ذرّية والطلب عند المزود قيد المعالجة:

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "txn_01J8ZTOP55",
      "reference": "SW-20260911-7H4N2R8C",
      "type": "TOPUP",
      "status": "PROCESSING",
      "amount": "5000.00",
      "fee": "100.00",
      "total": "5100.00",
      "currency": "YER",
      "created_at": "2026-09-11T11:04:55+03:00"
    },
    "note": "بانتظار نتيجة مزود الشحن — الحالة النهائية ستظهر في السجل وستصلك إشعاراً"
  },
  "meta": { "request_id": "req_01J8ZTOP60" }
}
```

الاستجابة الفاشلة (422) — تجاوز الحد اليومي (AC-06: الاستخدام المحسوب صحيح):

```json
{
  "success": false,
  "error": {
    "code": "ERR_TRF_LIMIT_DAILY",
    "message": "تجاوزت الحد اليومي لهذه العملية/العملة",
    "context": {
      "limit": "200000.00", "used": "195100.00", "requested": "5100.00", "currency": "YER", "window": "DAILY"
    }
  },
  "meta": { "request_id": "req_01J8ZTOP61" }
}
```

## 24.5 إنشاء حوالة — `POST /remittances`

الطلب:

```json
POST /v1/remittances
Authorization: Bearer eyJhbGciOi...
X-Device-Id: 7f9c2c1e-...
X-App-Version: 1.4.2
X-App-Platform: android
Accept-Language: ar
Idempotency-Key: 21f4d5c6-3333-4aaa-7bbb-2222cccc3333

{
  "amount": "150000.00",
  "currency": "YER",
  "recipient_name": "سالم محمد عبدالله",
  "recipient_phone": "712345678",
  "delivery_agent_id": "agt_01J8YADEN2",
  "pin_proof": "ppt_01J8ZPIN011B"
}
```

الاستجابة الناجحة (201) — رمز تسليم يعمل مرة واحدة مع صلاحية (FR-REM-002):

```json
{
  "success": true,
  "data": {
    "remittance": {
      "id": "rmt_01J8ZREMI12",
      "status": "PENDING_DELIVERY",
      "amount": "150000.00",
      "fee": "1500.00",
      "total": "151500.00",
      "currency": "YER",
      "recipient_name": "سالم محمد عبدالله",
      "delivery_agent_id": "agt_01J8YADEN2",
      "delivery_code": "8492 7731",
      "delivery_code_qr": "https://cdn.janoubwallet.com/qr/rmt_01J8ZREMI12.png",
      "expires_at": "2026-09-14T12:00:00+03:00"
    },
    "transaction": {
      "id": "txn_01J8ZREMT13",
      "reference": "SW-20260911-5K9W3T2B",
      "type": "REMITTANCE",
      "status": "COMPLETED",
      "amount": "150000.00",
      "fee": "1500.00",
      "total": "151500.00",
      "currency": "YER"
    }
  },
  "meta": { "request_id": "req_01J8ZREMI14" }
}
```

الاستجابة الفاشلة (422) — المبلغ أقل من الحد الأدنى للحوالة:

```json
{
  "success": false,
  "error": {
    "code": "ERR_TRF_AMOUNT_MIN",
    "message": "المبلغ أقل من الحد الأدنى المسموح",
    "context": { "min_amount": "5000.00", "currency": "YER", "service": "REMITTANCE" }
  },
  "meta": { "request_id": "req_01J8ZREMI15" }
}
```

## 24.6 تجميد مستخدم إدارياً — `POST /admin/users/{id}/freeze`

الطلب (جلسة إدارية بعد MFA — السبب إلزامي FR-ADM-003/010):

```json
POST /v1/admin/users/usr_01J8YU2219/freeze
Authorization: Bearer eyJhbGciOi...  (جلسة إدارية)
X-App-Platform: web-admin
X-App-Version: 1.0.0
Accept-Language: ar

{
  "reason_code": "SUSPECTED_FRAUD",
  "reason_text": "نمط تحويلات متكرر غير طبيعي — تنبيه محرك المخاطر رقم 552",
  "duration": "PERMANENT"
}
```

الاستجابة الناجحة (200) — تجميد + إنهاء الجلسات + Audit + إشعار المستخدم (AC-12):

```json
{
  "success": true,
  "data": {
    "user_id": "usr_01J8YU2219",
    "status": "FROZEN",
    "sessions_terminated": 3,
    "audit_log_id": "aud_01J8ZFREE01",
    "user_notified": true
  },
  "meta": { "request_id": "req_01J8ZFREE02", "actor_admin_id": "adm_01J7OP99" }
}
```

الاستجابة الفاشلة (409) — التجميد الطويل يتطلب موافقة ثانية (Maker-Checker):

```json
{
  "success": false,
  "error": {
    "code": "ERR_ADM_SECOND_APPROVAL_REQUIRED",
    "message": "يتطلب هذا الإجراء موافقة ثانية",
    "context": { "approval_id": "apr_01J8ZAPP55", "waiting_role": "Security Admin" }
  },
  "meta": { "request_id": "req_01J8ZFREE03" }
}
```

---

# 25. مصفوفة التغطية (مجموعة API ← وحدات FR)

| مجموعة API | وحدات FR المغطاة (وفق ترقيم SRS) |
|---|---|
| EP-BOOT | FR-OFF-001..003، FR-ADM-037/040/041، FR-SUP-005 (روابط الدعم)، FR-WLT-003، FR-NTF-002 (تكوين القنوات) |
| EP-AUTH | FR-AUTH-001..023، FR-GEO-003/010/011/012/013، FR-NTF-003 (الأمنية)، FR-ACC-002 (جزء التفضيلات) |
| EP-KYC | FR-KYC-001..006، 008، 009 (القرار عبر EP-ADM-09) |
| EP-WLT | FR-WLT-001..004، 006..008 (005/006/007 مع EP-WLT-03/04 Beta) |
| EP-TRF | FR-TRF-001..006، FR-LDG-004/005/009 (Idempotency/المرجع/الاستعلام بعد الانقطاع) |
| EP-FAV | FR-FAV-001..004 |
| EP-REM | FR-REM-001..005، 007، 008 (و006 عبر EP-HOOK) |
| EP-CWD | FR-CWD-001..007، FR-GEO (خريطة الوكلاء — نقاط الخدمة) |
| EP-PAY | FR-PAY-001..005، 007 (و006 تسويات التاجر عبر EP-MRC/EP-ADM) |
| EP-TOP | FR-TOP-001..006 (وRetry/Refund عبر EP-HOOK وEP-ADM-16) |
| EP-BIL | FR-BIL-001..005 (و004 سياسة الفشل عبر EP-ADM-16) |
| EP-NWC | FR-NWC-001..003 |
| EP-SAV | FR-SAV-001، 002، 004، 006 |
| EP-STM | FR-STM-001..006، FR-TRF-005 (الإيصال)، FR-SUP-004 (WhatsApp) |
| EP-NTF | FR-NTF-001..005، 007 |
| EP-SUP | FR-SUP-001..006 |
| EP-ACC | FR-ACC-001..004، 006 |
| EP-AGT | FR-CWD-001..003/006/007 (التنفيذ)، FR-REM-003 (التسليم)، FR-ADM-018 (تسوية الوكيل) |
| EP-MRC | FR-PAY-004..006، FR-ADM-023 (قراءة كشوف التاجر) |
| EP-ADM | FR-ADM-001..051 (بما فيها 032..036 عبر مسارات القراءة والإجراء أعلاه، و042 Broadcast، و048..050 سجل التدقيق) |
| EP-HOOK | FR-REM-006، FR-TOP-004/005، FR-BIL-004، FR-LDG-015/016، FR-ADM-034 (تغذية المعلقة) |

**سطر الفجوات لوظائف MVP/Beta (Must/Should): صفر.** كل متطلبات MVP/Beta لها نقطة تغطية. المؤجل بإرادة من التصنيف الأصلي (خارج MVP/Beta — ليس فجوة):

| المؤجل | التصنيف | ملاحظة |
|---|---|---|
| FR-CRY-001..003 | Won't | العملات الرقمية خارج هذه النسخة — لا نقاط نهاية (ومنهجية Custody مستقلة عند التفعيل) |
| FR-TRF-007 | Won't | تحويلات مجدولة/متكررة (Standing Orders) |
| FR-SAV-003 | Could | اقتراح قواعد الادخار الذكي — يُقدَّم كاقتراحات ضمن استجابة EP-SAV-01 عند تفعيله (لا عقد جديد) |
| FR-SAV-005 | Won't (افتراضي) | فائدة/مكافأة — مشروطة بموافقة شرعية/نظامية |
| FR-OFF-004 | Could (Launch) | قائمة انتظار العرض فقط (غير مالية) — سلوك عميل بلا عقد خادمي |
| FR-ACC-005 | Could (Launch) | تصدير بياناتي — يُضاف `GET /account/export` عند اعتماده |
| FR-KYC-010/011 | Could/Launch | انتهاء صلاحية التوثيق/Face Match الآلي — إنفاذ خادمي عند اعتماد المزود |
| FR-BIL-006 | Could | تذكير الفواتير المستحقة — يُفعَّل عبر الإشعارات الجماعية/قوالب عند دعم المزود |
| FR-GEO-015 | Could (Beta خريطة ساخنة) | تُلبَّى من EP-ADM-28 (تقارير المناطق بتجمع جغرافي) |

---

# الخاتمة

هذه الوثيقة تُغطي عقد REST الكامل لمحفظة الجنوب على ثلاث قنوات (تطبيق الموبايل بأدواره الثلاثة + لوحة الإدارة + Webhooks المزودين) وفق قاعدة Master PLAN §132: كل API يمر بـ Authentication → Authorization → Validation → Idempotency (حيث يلزم) → Business Rule → Transaction → Result — والخادم لا يترك الحسابات الحساسة للعميل (R-10). العقد جاهز للتوليد إلى OpenAPI 3.1 (ADR-011) ليبني عليه عملاء Flutter واللوحة من مصدر واحد.

## إحصاء الوثيقة

| البند | القيمة |
|---|---|
| مجموع نقاط النهاية | **130** (ضمن المستهدف 110–130) |
| نقاط التطبيق (عميل) | 84 موزعة على 17 مجموعة (EP-BOOT..EP-ACC) |
| نقاط الوكيل (EP-AGT) | 8 |
| نقاط التاجر (EP-MRC) | 7 |
| نقاط الإدارة (EP-ADM) | 30 (جدولة مضغوطة بالمجموعات وفق التكليف — البحث الموحد §61 يخدم القوائم) |
| نقاط Webhooks (EP-HOOK) | 1 (بثلاثة أنواع أحداث) |
| أكواد الأخطاء الموحدة | 59 كوداً في 6 عائلات + عائلة الويب هوك |
| غلاف الاستجابة / الترقيم | موحد (§1.5/§1.6) — cursor-based إلزامي |

## الموافقة

| الدور | الاسم | التوقيع | التاريخ |
|---|---|---|---|
| صاحب المنتج | | | |
| مدير المشروع | | | |
| المعماري | | | |
| رائد الأمن والمخاطر | | | |

> **الخطوة التالية (بانتظار الاعتماد):** توليد مواصفة OpenAPI 3.1 من هذه الوثيقة، ثم بناء وحدات NestJS وفق ARCHITECTURE §6.2 مع Migrations من DATABASE_ERD §10.1 — واختبارات عقود لكل مسار مالي (AC-01..AC-12).
