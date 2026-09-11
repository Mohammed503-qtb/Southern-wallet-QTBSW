# المعمارية التقنية الكاملة — محفظة الجنوب

## بطاقة الوثيقة

| البند | القيمة |
|---|---|
| اسم المنتج | محفظة الجنوب — South Wallet |
| معرّف الحزمة (Package Name) | `com.janoub.wallet` |
| إصدار الوثيقة | 1.0 |
| حالة الوثيقة | مسودة بانتظار الاعتماد |
| المعيار المتبع | C4 Model (مكيّف) + سجل قرارات معمارية ADR |
| وثائق مرجعية | Master PLAN.md (المرجع الحاكم) + docs/SRS.md (المرجع التعاقدي) |
| نطاق الوثيقة | معمارية تطبيق Flutter + لوحة الإدارة + الخادم + قاعدة البيانات + التكاملات + النشر والمراقبة |
| لغة الوثيقة | العربية (أساس) مع مصطلحات تقنية إنجليزية عند أول ورود |
| سلسلة الوثائق | SRS (خطوة 1) → **المعمارية (هذه الخطوة 3)** → قاعدة البيانات (خطوة 4) → API (خطوة 5) |

---

# 1. المقدمة

## 1.1 الغرض

تترجم هذه الوثيقة متطلبات `docs/SRS.md` إلى **معمارية تقنية قابلة للتنفيذ** وتثبّت القرارات المعمارية الكبرى التي تركتها SRS مفتوحة (وأبرزها حسم القيد **C-03**: الخادم Node.js + NestJS). وهي المرجع الهندسي الأول لـ:

- فريق Backend — لبناء الوحدات (Modules) ومحرك المعاملات ودفتر الأستاذ (Ledger).
- فريق Flutter — لبناء الطبقات وإدارة الحالة والتخزين المحلي الآمن.
- فريق لوحة الإدارة — لبناء الواجهة الإدارية على نفس REST API.
- DevOps — لبناء البيئات وخطوط CI/CD وخطط الاستمرارية.
- الامتثال والمخاطر — للتحقق من أن كل ضابط (R-01..R-14) له تجسيد معماري ملموس.

هذه الوثيقة **لا تحدد** مخططات الجداول تفصيلاً (الخطوة 4: وثيقة قاعدة البيانات) ولا عقود الـ Endpoints (الخطوة 5: وثيقة API) — بل تحدد الحدود والأنماط والقرارات التي ستُشتق منهما الوثيقتان (القسم 14).

## 1.2 الجمهور

| الجمهور | ما يهمه في هذه الوثيقة |
|---|---|
| معماري النظام | الأقسام 2، 3، 6، 7، 13 (المبادئ، النظرة الكلية، الوحدات، المحرك، ADR) |
| مطورو Backend | الأقسام 6، 7، 9، 10 (الوحدات، المعاملات، المزودون، الأداء) |
| مطورو Flutter | الأقسام 4، 8 (الطبقات، الأمان من منظور العميل) |
| مطورو لوحة الإدارة | الأقسام 5، 8 (بنية اللوحة، الأدوار وMFA) |
| DevOps / SRE | الأقسام 11، 12 (النشر، المراقبة، الكوارث) |
| الامتثال والمخاطر | الأقسام 2، 7، 8، 12 (التجسيد المعماري للقواعد) |

## 1.3 المرجعية وسلسلة الحقيقة

1. **Master PLAN.md** (`upload/Pasted Content_1789156753860.txt`) — المرجع الحاكم غير القابل للتفاوض؛ عند أي تعارض فهو الراجح.
2. **docs/SRS.md v1.0** — المرجع التعاقدي الوظيفي (252 FR / 40 NFR / قواعد R-01..R-14 / قيود C-01..C-10).
3. **هذه الوثيقة** — تُحسم فيها القرارات المعمارية (C-03، نمط الخادم، إدارة حالة Flutter) وتُشتق منها وثيقتا قاعدة البيانات وAPI.

سلسلة الحقيقة واحدة لا تتغير: **الخادم + دفتر الأستاذ (Ledger) داخل PostgreSQL هما مصدر الحقيقة المالية الوحيد** (Master PLAN §3، R-01). كل ما عداهما — التطبيق، اللوحة، الكاش، الإشعارات — عرضٌ ونقلٌ وإبلاغٌ فقط.

## 1.4 كيف تُقرأ هذه الوثيقة

- اقرأ القسم 2 أولاً: كل قرار لاحق في الوثيقة مربوط بقاعدة (R-XX) أو قيد (C-XX) من SRS أو قسم مرقّم من Master PLAN.
- الأقسام 3→6 تصاعدية (الكلية → العميل → اللوحة → الخادم).
- القسم 7 هو قلب الوثيقة (محرك المعاملات)؛ إن قرأت شيئاً واحداً فليكن هو.
- القسم 13 (ADR) يلخّص كل قرار وحالته وبديله وعواقبه.
- الرسوم كلها ASCII داخل كتل كود (نمط SRS §1.3)، والجداول بصيغة GFM.

---

# 2. المبادئ المعمارية الحاكمة (R-01..R-14 → التجسيد المعماري)

كل قاعدة جوهرية من SRS §1.6 لها انعكاس معماري **ملموس وقابل للفحص** في هذه المعمارية. هذا الجدول هو "اختبار القبول المعماري" — أي مكوّن يخالفه يُرفض في مراجعة التصميم:

| القاعدة | نص القاعدة (مختصر) | الانعكاس المعماري الملموس |
|---|---|---|
| **R-01** | الخادم + Ledger مصدر الحقيقة المالية | كل قراءة رصيد تمر عبر Wallet Service في الخادم؛ **لا يوجد مسار Client-side balance إطلاقاً**. التطبيق يستعرض قيماً جلبها من API ويوسمها بالوقت. لا يحسب رصيداً ولا يجمعه (Master PLAN §65) |
| **R-02** | لا عملية مالية Offline | كل زر مالي في Flutter يستدعي UseCase الذي يتحقق من الاتصال أولاً ويتوقف قبل أي إرسال؛ لا كيان "عملية معلّقة قابلة للتنفيذ محلياً" في Domain Layer — قائمة الانتظار غير المالية (FR-OFF-004) لا تحتوي منطق تنفيذ |
| **R-03** | كل عملية مالية: Atomic + Idempotent + في Ledger | محرك المعاملات (القسم 7) ينفذ Debit→Fee→Credit→Ledger داخل **معاملة PostgreSQL واحدة** مع جدول `idempotency_keys` وقيد مزدوج (Double-Entry) لا يقبل غير المتوازن |
| **R-04** | المعاملة المكتملة لا تُعدَّل | قواعد قاعدة البيانات: لا `UPDATE`/`DELETE` على `transactions`/`ledger_entries` المكتملة؛ التصحيح حصراً عبر معاملة Reversal مرتبطة بالأصل (Master PLAN §75) |
| **R-05** | لا "زر تعديل رصيد" للإدارة | لا Endpoint في أي وحدة يسمح `set balance`؛ Adjustment Request وحدة اعتماد (Maker-Checker) تولّد معاملة Ledger عادية — حتى Super Admin (Master PLAN §141) |
| **R-06** | GPS ليس الحكم الوحيد للأهلية | وحدة geo-eligibility تجمع **إشارات متعددة** (منطقة مسجلة + مزود الخدمة للرقم + IP/ASN + بصمة الجهاز + حالة الحساب + سياسة المنطقة)؛ GPS إشارة مساعدة فقط بوزن محدد (Master PLAN §4) |
| **R-07** | لا أسرار داخل Flutter | عميل Flutter لا يحتوي إلا Public Info (Base URL، مفتاح Firebase العام للإشعارات). كل أسرار المزودين في Secret Manager على الخادم وتُحقن في provider-adapters فقط (Master PLAN §81) |
| **R-08** | لا بيانات وهمية في الإنتاج | إعداد `NODE_ENV=production` يعطّل كل Mock Adapters ويوقف الإقلاع إذا وُجد مزود ممكَّن بلا اعتماد حقيقي؛ Mock يُسمح في dev/staging فقط بشروط (Master PLAN §139, §140) |
| **R-09** | كل وظيفة تكتمل بيانات+صلاحيات+API+حالات+إشعارات+إدارة+تدقيق+تقارير | قالب بناء أي وحدة جديدة (القسم 6.4) يفرض الحضور الكامل لهذه الأبعاد قبل اعتبار الوحدة "مكتملة" (DoD — Master PLAN §126, §127) |
| **R-10** | التطبيق غير موثوق؛ الخادم يعيد التحقق من كل شيء | طبقة Server-side Guards في كل Endpoint مالي: المبلغ، الرسوم (من fees لا من الطلب)، المستلم، الحدود، الحالة — القيم المعروضة في التطبيق "عرض مراجعي" فقط وغير ملزمة للخادم (Master PLAN §132) |
| **R-11** | العربية RTL من اليوم الأول | Flutter: `Directionality` وRTL هما مسار الاختبار الأساسي؛ لوحة الإدارة RTL أولاً؛ كشف الحساب والإيصال يُصدَّران RTL (NFR-L10N) |
| **R-12** | Flutter أصلي لا WebView | لا حزم WebView في شجرة اعتماديات التطبيق إلا لعروض محتوى اختيارية (الشروط) بلا أي تفاعل مالي؛ C-01 |
| **R-13** | Push لا يعني نجاح العملية | FCM قناة إبلاغ One-way؛ حالة الشاشة تُجلب دائماً من API (مع الاستعلام عن العمليات المعلقة عند العودة — FR-LDG-009)؛ الإشعار لا يستخدم كإشارة حالة في أي منطق مالي |
| **R-14** | السجلات المالية والتدقيق لا تُحذف | لا حذف فيزيائي لجداول `transactions`/`ledger_entries`/`audit_logs`؛ الحذف المنطقي للمحتوى فقط (بانرات/FAQ)؛ إغلاق الحساب يُخفي بيانات شخصية ويبقي السجلات (NFR-CMP-004) |

---

# 3. نظرة المعمارية الكلية (C4-Level 1)

## 3.1 رسم النظام (System Context + Containers)

```
 ┌──────────────────────┐          ┌──────────────────────────────┐
 │    تطبيق Flutter      │          │   لوحة الإدارة (React/Next)   │
 │   Android + iOS      │          │   RTL — أدوار إدارية 7        │
 │   com.janoub.wallet  │          │   MFA إلزامي — تطبيق منفصل    │
 │   Riverpod + 4 طبقات │          │   يستهلك نفس REST API        │
 └──────────┬───────────┘          └──────────────┬───────────────┘
            │ HTTPS/TLS 1.2+ REST+JSON           │ HTTPS/TLS 1.2+ + MFA
            │ JWT 15د + Idempotency-Key           │
            └────────────────┬────────────────────┘
                             ▼
           ┌─────────────────────────────────────┐
           │       Load Balancer / Nginx (TLS)   │
           └────────────────┬────────────────────┘
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │         NestJS Modular Monolith (Node.js + TypeScript)       │
 │ ┌─────────────┐ REST Gateway: Authn → Guards → Validation    │
 │ │  API Layer  │ → Idempotency → UseCase → Unit of Work       │
 │ └──────┬──────┘                                               │
 │        │  Bounded Contexts (حدود وحدات صارمة):                 │
 │  identity │ geo-eligibility │ kyc │ wallet-core               │
 │  transaction-engine │ fees │ limits │ risk-engine             │
 │  transfers │ remittances │ cash-operations                   │
 │  merchant-payments │ topup │ bills │ network-cards │ savings │
 │  statements │ notifications │ support │ content-config       │
 │  administration │ audit │ reconciliation │ provider-adapters │
 └──┬──────────────┬─────────────────────┬──────────────┬────────┘
    │              │                     │              │
┌───▼─────────┐ ┌──▼───────┐   ┌─────────▼───────┐ ┌───▼──────────────┐
│ PostgreSQL  │ │  Redis   │   │ S3-Compatible    │ │  مزودون خارجيون  │
│ Primary (RW)│ │ Cache /  │   │ Storage          │ │  عبر Adapters:   │
│ ─────────── │ │ Sessions │   │ مستندات KYC      │ │  SMS │ FCM │ شحن │
│ Replica (RO)│ │ / Rate   │   │ مشفّرة +         │ │  فواتير │ صرافة │
│ + Ledger    │ │ / Locks  │   │ Signed URLs      │ │  خرائط (A-06)    │
└─────────────┘ └──────────┘   └──────────────────┘ └──────────────────┘
```

## 3.2 جدول المكونات (Containers)

| # | المكوّن | التقنية | المسؤولية | المصدر الحقيقي؟ |
|---|---|---|---|---|
| 1 | تطبيق الموبايل | Flutter + Dart (Riverpod) | عرض الحالة، جمع المدخلات، التحقق الأولي، إرسال الطلب، عرض النتيجة (Master PLAN §3) | لا — عرض فقط |
| 2 | لوحة الإدارة | React/Next.js (RTL) | العمليات الإدارية السبع + Audit + التقارير | لا — عمليات عبر الخادم |
| 3 | الخادم | Node.js + NestJS (Modular Monolith) | كل منطق الأعمال المالي والضوابط والمعاملات | **نعم — مع قاعدة البيانات** |
| 4 | قاعدة البيانات | PostgreSQL 15+ (Primary + Replica) | Ledger + المعاملات + الكيانات؛ ACID | **نعم — مصدر الحقيقة** |
| 5 | الكاش | Redis | جلسات Refresh Tokens، Rate Limiting، كاش إعدادات/أرصدة قراءة، أقفال موزعة، طوابير خفيفة | لا — كاش قابل للإسقاط |
| 6 | تخزين الملفات | S3-Compatible | مستندات KYC مشفّرة بصلاحيات موقّعة | مستندات فقط (لا مالية) |
| 7 | المزودون | SMS / FCM / شحن / فواتير / صرافة / خرائط | خدمات خارجية عبر provider-adapters | لا — تكامل فقط |
| 8 | LB / Nginx | Nginx أو LB مُدار | TLS termination، توزيع، Health checks | لا |

## 3.3 قنوات الاتصال

| القناة | البروتوكول | ملاحظات |
|---|---|---|
| تطبيق ↔ خادم | HTTPS REST/JSON + TLS 1.2+ | JWT 15 دقيقة + Refresh Rotation + `Idempotency-Key` للعمليات الحساسة |
| لوحة ↔ خادم | HTTPS REST/JSON نفسه | نفس البوابة، أدوار إدارية + MFA (FR-ADM-002) — مصدر حقيقة واحد (Master PLAN §96) |
| خادم ↔ PostgreSQL | TCP (داخل شبكة خاصة) | معاملات ACID + `SELECT … FOR UPDATE` للأقفال |
| خادم ↔ Redis | TCP | كاش + أقفال + عدادات الحدود |
| خادم ↔ المزودين | HTTPS عبر Adapters | مرجع خارجي + Idempotency لكل طلب (Master PLAN §68, §70) |
| FCM ↔ تطبيق | Push | إبلاغ فقط — R-13 |

---

# 4. معمارية تطبيق Flutter

## 4.1 الطبقات (Master PLAN §130 — Flutter)

```
┌─────────────────────────────────────────────────────────┐
│ Presentation — Widgets / Views / Design System           │
│ شاشات RTL (SRS §7.2) + كل حالات الواجهة (SRS §7.3)     │
│ لا منطق أعمال داخل Widgets (Master PLAN §130)          │
└───────────────────────┬─────────────────────────────────┘
                        │ يستدعي
┌───────────────────────▼─────────────────────────────────┐
│ Application — UseCases / Controllers (Riverpod)          │
│ كل تدفق مستخدم = UseCase واحد (مثال: TransferUseCase)   │
│ ينسّق: جلب Quote → عرض مراجعي → PIN → إرسال → نتيجة    │
└───────────────────────┬─────────────────────────────────┘
                        │ يعتمد على
┌───────────────────────▼─────────────────────────────────┐
│ Domain — Entities + Repository Interfaces (مجردة)       │
│ Wallet, Transaction, Remittance, SavingGoal...          │
│ قواعد العرض فقط (تنسيق عملة/تاريخ) — لا قواعد مالية    │
└───────────────────────┬─────────────────────────────────┘
                        │ يُنفَّذ بواسطة
┌───────────────────────▼─────────────────────────────────┐
│ Data — Repository Implementations + DTOs + API Client   │
│ REST Client واحد + كاش عرض مؤقت + Secure Storage        │
│ DTOs مولّدة آلياً من OpenAPI (ADR-011)                 │
└─────────────────────────────────────────────────────────┘
```

قواعد إلزامية للطبقات:

1. **UI → UseCase → Repository → API** — لا وصول مباشر من الواجهة لقاعدة بيانات أو شبكة (SRS §8 قيد 1، Master PLAN §131).
2. **Domain لا يعرف Flutter ولا Dio** — كيانات وواجهات نقية قابلة للاختبار بمعزل عن المنصة.
3. **لا منطق مالي في أي طبقة عميلة** — الرسوم والحدود والأهلية تُجلب كـ Quote من الخادم وتُعرض؛ الحساب خادمي حصراً (R-10).
4. **كل UseCase مالي ينتهي بحالة** — لا قيمة "نجاح افتراضي"؛ يعرض إحدى حالات القبول (Pending/Error/Offline…) أو يفشل صريحاً.

## 4.2 إدارة الحالة — القرار: Riverpod (ADR-010)

**الاختيار المعماري: Riverpod 2 (مع riverpod_generator / code-gen).**

| المعيار | Riverpod | البديل: Bloc |
|---|---|---|
| التوافق مع منطق الطبقات | Providers تُحاكي UseCases/Repositories بشكل طبيعي بدون coupling بالواجهة | Cubits/Blocs تطبيق طبقي ممتاز لكن يزيد boilerplate لكل تدفق |
| Testability | إلغاء الاعتماديات (override) في الاختبارات مباشر | مماثل عبر mock Bloc |
| كشف الأخطاء compile-time | riverpod_generator يعطي أنواعاً مولّدة آمنة | آمن نوعياً لكن أطول كتابة |
| حجم الفريق | فريق صغير → أقل كوداً ضاجاً | أفضل للفرق الكبيرة المتفقية على نمط صارم |

مسوغات إضافية: مجتمع نشط، توافق مع code-generation (وopenapi generators)، دعم StateNotifier/AsyncNotifier الذي يلائم "شاشة = حالة غير متزامنة من الخادم". **Bloc يبقى بديلاً مقبولاً** إن قرر فريق Flutter لاحقاً اعتماده قبل بدء التنفيذ — القرار قابل للتغيير الآن وغير قابل بعده (نقطة تثبيت: نهاية Phase 1 — Master PLAN §128).

## 4.3 التخزين المحلي والأسرار (Master PLAN §65)

| النوع | المسموح | الأداة |
|---|---|---|
| Tokens الجلسة | Access Token في الذاكرة + Refresh Token في Secure Storage (Keychain/Keystore) | flutter_secure_storage |
| تفضيلات | لغة، ثيم، إخفاء الرصيد | SharedPreferences |
| كاش عرض | آخر أرصدة/عمليات بوسم "بيانات قديمة" + TTL | تخزين مؤقت قابل للمسح الكامل |
| قائمة انتظار غير مالية | عناصر FR-OFF-004 بانتظار الاتصال | تخزين محلي بلا أي منطق تنفيذ |

**ممنوعات صريحة:** PIN محلي، أرصدة "حقيقية" موثوقة، أسرار مزودين، حساب رسوم محلي (R-07، R-01، Master PLAN §81). حماية من التلاعب: Certificate Pinning (NFR-SEC-001)، كشف Root/Jailbreak/محاكي كإشارة تُرفع للخادم لا كقرار محلي (NFR-SEC-007، R-10).

## 4.4 وضع عدم الاتصال (Offline) — FR-OFF / R-02

```
دون إنترنت:
  شاشات غير مالية → تعمل (FAQ، الإعدادات، آخر كاش بوسم "بيانات قديمة")
  شاشات مالية → الأزرار معطّلة برسالة واضحة — لا إرسال، لا خصم محلي
  عناصر قائمة الانتظار (FR-OFF-004) → تُعرض "بانتظار الاتصال" فقط

عند عودة الاتصال:
  استعلام حالة العمليات المعلقة أولاً (Check Transaction Status)
  ثم فقط يُسمح بعملية جديدة  (Master PLAN §67، FR-LDG-009، AC-04)
```

## 4.5 Deep Links والتوجيه داخل التطبيق

- كل إشعار يحمل `deep_link` (مثال: `swallet://transaction/SW-20260911-XXXXXXXX`) يفتح **تفاصيل العملية نفسها** لا الرئيسية (FR-NTF-004).
- QR التاجر يُلتقط بالكاميرا و **يُرسل خاماً للخادم** لفك التوقيع — لا ثقة بنص QR محلياً (FR-PAY-001، R-10).
- حوامل الارتباط: `swallet://` للتطبيق + Universal Links/App Links لاحقاً.

## 4.6 حِزم قابلة للمحاكاة (Mockable) للتكامل

كل Repository Interface في Domain له تنفيذان: `ApiXxxRepository` (إنتاج) و`FakeXxxRepository` (اختبارات/بيئة dev). واجهات API Client نفسها تُبنى فوق واجهة `ApiClient` قابلة للاستبدال — ما يجعل كل طبقة Flutter قابلة لاختبار بمعزل، ويمكّن فريق الواجهة من العمل قبل جاهزية Endpoints الحقيقية **بشرط ألا تصل أي Fake إلى بيئة الإنتاج** (R-08).

---

# 5. معمارية لوحة الإدارة

## 5.1 القرار

تطبيق ويب **منفصل عن تطبيق الموبايل** (مستودع منفصل، نشر مستقل) يستهلك **نفس REST API** للخادم — بوابة واحدة، ضوابط واحدة، Audit واحد (Master PLAN §96: التطبيق والإدارة من مصدر حقيقة واحد).

| البند | القرار |
|---|---|
| الإطار | React / Next.js (App Router) — RTL أولاً (R-11) |
| الوصول | نفس بوابة الـ API عبر نطاق إداري منفصل (مثال `admin.janoub.wallet`) خلف قيود IP اختيارية |
| المصادقة | Username/Password قوي + **MFA إلزامي** (TOTP) + قفل بعد محاولات + جلسات قابلة للإبطال (FR-ADM-002، Master PLAN §78) |
| الصلاحيات | Role → Permission → Scope **تُفرض في الخادم** — الواجهة تخفي ما لا يملكه الدور فقط (FR-ADM-001، AC-09) |
| الإجراءات الحساسة | نافذة تأكيد + سبب إلزامي + Maker-Checker للعمليات الخطيرة (Freeze/Adjustment/Fee Change…) (Master PLAN §79) |
| البيانات | كل رقم في اللوحة من طبقة البيانات الفعلية عبر تقارير الخادم — لا حسابات واجهية (FR-ADM-006) |

## 5.2 بنية اللوحة

```
Pages (Admin: Dashboard / Users / KYC / Agents / Merchants /
       Transactions / Fees-Limits / Regions / Services /
       Content / Notifications / Versions / Security / Audit /
       Reconciliation / Reports)
        │
Feature Modules (كل مجال = موديول: state + hooks + components)
        │
API Client (مولّد من OpenAPI — نفس مولّد التطبيق)
        │
Auth Guard + RBAC Guard (يعرض فقط ما أذن به الخادم)
```

- **Audit-first**: كل شاشة إجراء حساس تمر بنمط "تأكيد + سبب + (موافقة ثانية عند اللزوم)" قبل الإرسال.
- **قيد معماري**: اللوحة **لا تملك** أي مسار كتابة مباشر لقاعدة البيانات أو للمزودين — 100% عبر API (R-05، Master PLAN §141).

---

# 6. معمارية الخادم — NestJS Modular Monolith

## 6.1 قرار النمط: Modular Monolith (ADR-002)

**النمط المعتمد:** تطبيق NestJS واحد (Process واحد) مقسّم داخلياً إلى **وحدات حدود صارمة (Bounded Contexts)**، كل وحدة تملك كياناتها وواجهاتها العامة، ويُمنع الوصول لجداول وحدة أخرى إلا عبر واجهتها المصدَّرة.

**التبرير:**

1. **فريق صغير** — تنسيق 24 خدمة microservices يستهلك أكثر مما ينتج؛ Monolith واحد يُنشر ويُراقب أبسط بكثير.
2. **Atomicity داخل Process واحد** — معاملة `Debit→Fee→Credit→Ledger` داخل اتصال PostgreSQL واحد هي **أأمن وأبسط** من الـ Saga/التوزيع المبكر (Master PLAN §15، R-03). التوزيع يضيف نقاط فشل شبكية في بيئة إنترنت ضعيفة أصلاً (RK-02).
3. **Deployment واحد** — بيئة محدودة الموارد (C-09) تتحمل حاوية خادم واحدة + قاعدة بيانات + Redis بشكل مثالي.
4. **قابلية الفصل لاحقاً** — الحدود الصارمة (interfaces داخلية لا implementations) تجعل استخراج وحدة (مثلاً notifications أو provider-adapters) خدمة مستقلة عمليةً مباشرة عند الحاجة الفعلية، لا إعادة كتابة.

**قواعد الحدود (Enforcement):**

- كل وحدة NestJS تُصدّر **واجهة (Token/Interface)** فقط؛ الـ implementation داخلي (private).
- **يُمنع** استيراد وحدة لـ implementation وحدة أخرى — المراجعة ترفض أي import مباشر بين الوحدات.
- جدول قاعدة البيانات مملوك لوحدة واحدة (owner module) — الوحدات الأخرى تقرأ عبر الواجهة أو تطبيق Read Model.
- Cross-module في نفس الطلب = منسّق (UseCase/Orchestrator) يستدعي الواجهات المتعددة داخل معاملة واحدة — لا أحداث غير متزامنة داخل المسار المالي (المعاملة تلتزم ACID).

## 6.2 جدول الوحدات (Bounded Contexts)

| # | الوحدة | المسؤولية | الوحدات الملامسة | أهم الكيانات |
|---|---|---|---|---|
| 1 | **identity** | التسجيل، OTP، الدخول، PIN (Argon2id)، الأجهزة، الجلسات، JWT/Refresh التدوير | geo-eligibility, risk-engine, notifications | users, profiles, devices, sessions, otp_codes, pin_attempts |
| 2 | **geo-eligibility** | النظام الجغرافي المركزي + تقييم الأهلية متعدد الإشارات + كشف Spoof/VPN | identity, risk-engine | regions, districts, areas, eligibility_policies, eligibility_decisions |
| 3 | **kyc** | مستويات التوثيق، رفع المستندات، طابور المراجعة، القرارات | identity, risk-engine, provider-adapters (تخزين), notifications | kyc_profiles, kyc_documents, kyc_reviews |
| 4 | **wallet-core** | المحافظ، العملات، حسابات الأستاذ، الأرصدة، Hold/تجميد | transaction-engine, fees, limits | wallets, wallet_balances, currencies, ledger_accounts, ledger_entries |
| 5 | **transaction-engine** | **القلب**: التنفيذ الذرّي، Idempotency، آلة الحالة، Reversal | wallet-core, fees, limits, risk-engine, notifications, audit | transactions, transaction_items, transaction_status_history, idempotency_keys |
| 6 | **fees** | محرك قواعد الرسوم المركزي + إصدارات + لقطات | transaction-engine, administration | fee_rules, fee_rule_versions, fee_snapshots |
| 7 | **limits** | محرك الحدود (يومي/أسبوعي/شهري/رصيد) + الاستخدام الجاري | transaction-engine, administration | limit_rules, limit_usages |
| 8 | **risk-engine** | قواعد الإشارات → ALLOW/REVIEW/BLOCK، التجميد الأمني | transaction-engine, identity, geo-eligibility, audit | risk_rules, risk_events, security_events |
| 9 | **transfers** | تحويل لمشترك + بين محافظ المستخدم (FX داخلي) | transaction-engine, wallet-core | transfers (كيان تخصيص فوق transactions) |
| 10 | **remittances** | الحوالات لغير المشتركين، رمز التسليم، التسليم عبر وكيل، الإلغاء/الانتهاء | transaction-engine, cash-operations, notifications | remittances, remittance_delivery_codes |
| 11 | **cash-operations** | الإيداع/السحب النقدي عبر الوكلاء، Hold، Float، رمز السحب | transaction-engine, geo-eligibility (وكلاء) | deposit_requests, withdrawal_requests, agents, agent_float_ledger |
| 12 | **merchant-payments** | الدفع QR/POSCOF، وضع التاجر، تسويات التاجر | transaction-engine, geo-eligibility, notifications | merchants, merchant_branches, terminals, qr_codes, payments, merchant_settlements |
| 13 | **topup** | شحن رصيد الجوال عبر الشبكات/المنتجات | transaction-engine, provider-adapters | networks, network_products, topups |
| 14 | **bills** | سداد الفواتير: استعلام، دفع، سياسة فشل | transaction-engine, provider-adapters | bill_providers, bill_products, bill_payments |
| 15 | **network-cards** | بيع كروت الشبكة من المخزون: حجز ثم تسليم | transaction-engine | network_cards_inventory, card_sales |
| 16 | **savings** | الحصالة: أهداف، إيداع/سحب عبر Ledger فعلي | transaction-engine, wallet-core | savings_accounts, savings_goals, savings_transactions |
| 17 | **statements** | كشف الحساب، السجل، الفلاتر، تصدير PDF موقّع | wallet-core, transaction-engine (قراءة) | statements_exports |
| 18 | **notifications** | القوالب، القنوات (FCM/SMS/In-App)، Deep Links، تفضيلات | كل الوحدات (كمستهلك لـ events) | notifications, notification_templates, device_push_tokens |
| 19 | **support** | التذاكر، المحادثة، الربط بالمعاملة، WhatsApp | statements, transaction-engine (قراءة) | support_tickets, support_messages, ticket_ratings |
| 20 | **content-config** | المحتوى (بانرات/FAQ/شروط)، Remote Config، Feature Flags، الإصدارات، حالات النظام/الخدمة | administration | content, banners, faqs, feature_flags, system_settings, app_versions, service_states |
| 21 | **administration** | RBAC (Role→Permission→Scope)، المستخدمون، الإجراءات الإدارية، Maker-Checker | كل الوحدات (عبر واجهات)، audit | roles, permissions, role_permissions, admin_actions, approvals |
| 22 | **audit** | Audit Log غير قابل للتعديل + Security Events + عزل السجلات الثلاثة | كل الوحدات (كمصدّر events) | audit_logs, security_logs, financial_audit_trail |
| 23 | **reconciliation** | Job المطابقة الدوري، RECONCILIATION_ALERT، تسويات الوكلاء/التجار/المزودين | wallet-core, transaction-engine, administration | reconciliation_runs, reconciliation_items, provider_settlements |
| 24 | **provider-adapters** | الواجهة المشتركة لكل مزود خارجي + Idempotency خارجي + سياسات الفشل | topup, bills, kyc, notifications, identity (SMS) | provider_integrations, provider_calls, external_references |

> ملاحظة: عدد الوحدات 24 بما فيها provider-adapters كمكوّن عرضي (Cross-cutting للتكامل). الحدود قابلة لإعادة النظر قبل التنفيذ، **ليس أثناءه**.

## 6.3 التبعيات المسموحة بين الوحدات

```
القاعدة الذهبية: الاعتماد على interfaces داخلية لا على implementations

identity ──► geo-eligibility, risk-engine (واجهات فقط)
transaction-engine ──► wallet-core, fees, limits, risk-engine (واجهات فقط)
transfers / remittances / cash-operations / merchant-payments /
topup / bills / network-cards / savings ──► transaction-engine (واجهة Execute)
topup / bills ──► provider-adapters (واجهة ProviderInterface)
administration ──► وحدات المجال (واجهات إدارة لكل وحدة)
notifications, audit ──► يستهلكان أحداث مجال (Domain Events) بعد Commit
reconciliation ──► wallet-core, transaction-engine (قراءة فقط)

ممنوع:
  ✗ استيراد module لجداول/implementation وحدة أخرى
  ✗ أي وحدة تكتب في wallet_balances/ledger_* عدا transaction-engine (عبر wallet-core)
  ✗ أي وحدة تستدعي مزوداً خارجياً مباشرة — حصراً عبر provider-adapters
  ✗ أي تبعية دائرية بين وحدتين (تُحل بمستوى تجريد أعلى أو event)
```

## 6.4 قالب بناء وحدة جديدة (R-09 / Master PLAN §126)

أي وحدة/ميزة جديدة تكتمل بهذا الترتيب — فقدان خطوة = الوظيفة غير مكتملة:

```
Business Rule → Data Model → Permission → API → Backend Logic
→ Transaction/State → Flutter UI → Notifications → Admin Control
→ Audit → Reports → Tests        (Master PLAN §126, §127 DoD)
```

نمط زائف مبسّط لشكل UseCase مالي (بلا تفاصيل API — القسم 7 يفصّله):

```
UseCase: ExecuteTransfer
  1. Guards: Authn → Authz → Device → Idempotency
  2. Quote: اقرأ الرسوم من fees (لا من الطلب) — R-10
  3. Tx: BEGIN
       ├─ lock wallet rows (sender, receiver)
       ├─ limit check (limits) + risk check (risk-engine)
       ├─ debit sender + fee credit + credit receiver
       ├─ ledger entries (double-entry)
       └─ status history + COMMIT
  4. بعد الـ Commit: notifications + receipt  (خارج المعاملة)
```

---

# 7. محرك المعاملات ودفتر الأستاذ (قلب النظام)

## 7.1 التدفق الذري خطوة بخطوة (Master PLAN §15, §16)

```
┌────────────────────────────────────────────────────────────────┐
│ 0. Idempotency Check — جدول idempotency_keys                   │
│    (user_id + endpoint + key) ──موجود؟──► إرجاع النتيجة نفسها  │
│    ──غير موجود──► INSERT سجل (pending) داخل نفس معاملة DB      │
├────────────────────────────────────────────────────────────────┤
│ 1. Validation (VALIDATING)                                     │
│    Authn → Authz → أهلية geo → حالة الحساب/الخدمة/النظام      │
│    → الرسوم من fees (quote مثبّت: fee_rule_id + fee_version)    │
│    → الحدود من limits (الاستخدام الحالي + المطلوب ≤ الحد)      │
│    → المخاطر من risk-engine (ALLOW/REVIEW/BLOCK)               │
│    → الرصيد الكافي (available لا total)                        │
│    ──فشل──► REJECTED/UNDER_REVIEW + Rollback + إرجاع سبب       │
├────────────────────────────────────────────────────────────────┤
│ 2. قفل الصفوف (AUTHORIZED)                                     │
│    SELECT … FOR UPDATE على wallet_balances للطرفين+حساب الرسوم │
│    + قفل تسلسل ledger_accounts (ترتيب أقفال موحّد بالمعرّف     │
│      لمنع Deadlocks)                                          │
├────────────────────────────────────────────────────────────────┤
│ 3. Debit — خصم المحفظة المرسلة (available-, إجمالي متوازن)    │
│ 4. Fee — إضافة الرسوم لحساب الرسوم (system fee account)       │
│ 5. Credit — إضافة للمستلم                                     │
├────────────────────────────────────────────────────────────────┤
│ 6. كتابة ledger_entries (قيد مزدوج Double-Entry)               │
│    كل معاملة: مجموع debits = مجموع credits (قيد CHECK في DB)  │
│    مثال التحويل:                                               │
│      debit  محفظة المرسل   = amount + fee                      │
│      credit محفظة المستلم  = amount                            │
│      credit حساب الرسوم    = fee                               │
│    ── مجموع الدين = مجموع الدائن ──                            │
├────────────────────────────────────────────────────────────────┤
│ 7. transaction + snapshot (الرسوم/السعر/الأطراف/المزود)        │
│    + transaction_status_history (الانتقال + الفاعل + الوقت)   │
├────────────────────────────────────────────────────────────────┤
│ 8. COMMIT — (COMPLETED)                                        │
├────────────────────────────────────────────────────────────────┤
│ 9. بعد الـ Commit (خارج معاملة المال):                         │
│    إشعار الطرفين (FCM/SMS) + إيصال + مرجع SW-YYYYMMDD-XXXX    │
│    ── فشل الإشعار لا يرجع المعاملة (R-13) ──                   │
└────────────────────────────────────────────────────────────────┘
```

**أرقام مهمة:** مرجع المعاملة `SW-YYYYMMDD-XXXXXXXX` فريد (FR-LDG-005). Snapshot المعاملة يحفظ كل ما يفسّرها لاحقاً: الخدمة، العملة، المبلغ، الرسوم + `fee_rule_id` + `fee_version`، الأطراف، المزود، المرجع الخارجي، الأوقات، الحالة (FR-LDG-006، Master PLAN §74).

## 7.2 آلة حالة المعاملة (Master PLAN §17، SRS ملحق أ)

```
                    ┌──────────────┐
                    │   CREATED    │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐   فشل تحقق    ┌──────────────┐
                    │  VALIDATING  │──────────────►│   REJECTED   │
                    └──────┬───────┘               └──────────────┘
                           ▼ مراجعة مخاطر/أهلية
                    ┌──────────────┐
                    │  AUTHORIZED  │──── توقف مؤقت ──► UNDER_REVIEW ──► (عودة للمسار أو REJECTED)
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐   فشل تنفيذ   ┌──────────────┐
                    │  PROCESSING  │──────────────►│    FAILED    │
                    └──────┬───────┘               └──────────────┘
                           ▼ نجاح
                    ┌──────────────┐
                    │  COMPLETED   │───── تصحيح موثّق ───► REVERSED
                    └──────────────┘

  حالات نهائية إضافية من أي حالة قبل COMPLETED:
  CANCELLED (طلب المستخدم/الوكيل) │ EXPIRED (انتهاء مهلة السحب/الحوالة)
  لا انتقالات عشوائية — كل انتقال مسموح معرّف ومسجّل
```

حالات خاصة مشتقة: السحب `READY_FOR_COLLECTION → COLLECTED` قبل COMPLETED، الحوالة `PENDING_DELIVERY → DELIVERED` — كلها نفس محرك آلة الحالة بتعريفات انتقالات خاصة لكل نوع خدمة (SRS ملحق أ).

## 7.3 معالجة الفشل بين الخطوات (خطة التعويض)

| نقطة الفشل | الحالة عند الخروج | الإجراء المعماري |
|---|---|---|
| قبل إرسال الطلب | لا شيء تغيّر | لا Rollback — لا سجل مالي (Master PLAN §67) |
| أثناء Validation | REJECTED / UNDER_REVIEW | Rollback كامل، سبب مقنّن machine_code، تسجيل محاولة في risk-engine إذا كانت إشارة |
| بعد القفل قبل Debit | FAILED | Rollback — تحرير الأقفال تلقائياً بانتهاء المعاملة |
| بعد Debit قبل COMMIT | FAILED | **Rollback كامل** — ACID يضمن عدم بقاء خصم بلا إضافة (Master PLAN §15) |
| فشل عميل بعد الإرسال قبل النتيجة | PROCESSING (معلّقة) | عند العودة: التطبيق **يستعلم عن نفس العملية** ولا ينشئ طلباً جديداً — Idempotency يضمن عدم الازدواج (FR-LDG-009، AC-04) |
| فشل مزود خارجي بعد الخصم | PROCESSING → إحدى: | **لا خصم غير مفسَّر** — سياسة القسم 69 أدناه |

### سياسة فشل المزود الخارجي (Master PLAN §69, §70)

```
Wallet Debit (داخل معاملة DB) ──► Provider Request (خارجها)

فشل المزود ──► Pending (حالة معلنة للعميل، "بانتظار المزود")
              ├─ Retry: مشروط بـ (transaction state + provider
              │         reference + idempotency + retry policy)
              │         — لا Retry أعمى (Master PLAN §70)
              ├─ Reverse: عكس كامل موثّق (Reversal) عند التأكد من الرفض
              └─ Refund: استرداد عبر معاملة مستقلة مرتبطة بالأصل

النتيجة واضحة دائماً في السجل + إشعار المستخدم (FR-BIL-004, AC-08)
وظيفة إدارية: قائمة Pending Ops بإجراءات مسموحة (Retry/Cancel/
Reverse/Review) — لا زر "Complete" عشوائي (FR-ADM-034)
```

## 7.4 Reversal / Adjustment (R-04, R-05)

- **Reversal**: معاملة جديدة مرتبطة بـ `original_transaction_id` تولّد قيوداً معاكسة — لا `UPDATE` للأصل.
- **Adjustment Request**: طلب مالي إداري (مبلغ + سبب + مرجع) → موافقة Maker-Checker → معاملة Ledger عادية → Audit. **لا مسار `set balance` في أي طبقة** (Master PLAN §141).
- انتهاء مهلة السحب (EXPIRED) يحرّر الـ Hold تلقائياً عبر Reversal + إشعار (FR-CWD-003)؛ إلغاء الحوالة غير المسلّمة يرجع المال عبر Reversal (FR-REM-005).

---

# 8. الأمان المعماري

## 8.1 خريطة الضوابط

| الضابط | القرار المعماري | المرجع |
|---|---|---|
| النقل | TLS 1.2+ إلزامي على كل القنوات + Certificate Pinning في التطبيق | NFR-SEC-001 |
| الجلسة | **JWT قصير العمر (15 دقيقة)** + **Refresh Token بالتدوير (Rotation)** مع **Reuse Detection**: استخدام refresh مُستهلك = تسريب محتمل → إبطال عائلة الجلسة + Security Event | NFR-SEC-004، FR-AUTH-023 |
| OTP | توليد وتحقق **خادمي حصراً**: hash + TTL (5 دقائق) + حد 5 محاولات + قفل 15 دقيقة + حدود إرسال يومية | FR-AUTH-001/002، ADR-006 |
| PIN | **Argon2id** في الخادم فقط؛ تأخير تصاعدي/قفل بعد المحاولات؛ لا تخزين محلي | FR-AUTH-015/017، ADR |
| تشفير الحقول | AES-256-GCM للحقول الحساسة (بيانات هوية KYC) + مفاتيح في **KMS** خارج قاعدة البيانات | NFR-SEC-003 |
| الأسرار | Secret Manager حصراً (بيئة/سر منفصل لكل بيئة) — لا أسرار في الكود/التطبيق/Logs | R-07، Master PLAN §81 |
| Rate Limiting | Redis: نافذة زمنية لكل رقم/IP/جهاز/Endpoint | NFR-SEC-006 |
| بصمة الجهاز | تُنشأ عند التسجيل وتُقارن عند الدخول وكل عملية حساسة؛ إشارة لمحرك المخاطر | FR-GEO-010 |
| الصلاحيات | Role → Permission → Scope تُفرض في **Guards** الخادم قبل أي UseCase | FR-ADM-001، AC-09 |
| MFA للإدارة | TOTP إلزامي لكل أدوار اللوحة + قيود IP اختيارية | FR-ADM-002، Master PLAN §78 |
| التلاعب بالتطبيق | التطبيق غير موثوق (R-10): الخادم يعيد التحقق من المبالغ/الرسوم/المستلم/الحدود/الحالة؛ كشف Root/Jailbreak/Mock-location كإشارة | NFR-SEC-005/007 |
| الأخطاء | صيغة موحّدة: `machine_code` + `user_message` — التفاصيل التقنية في Logs فقط | NFR-SEC-011، Master PLAN §82 |
| فصل البيانات | عامة/حساسة/مالية/أمنية — كل دور يرى ما يخصه (Scope) | NFR-SEC-008، Master PLAN §80 |

## 8.2 خط الدفاع للطلب المالي الواحد

```
Request ─► TLS/Pinning ─► Rate Limit (Redis) ─► JWT Verify ─► Device Fingerprint Check
       ─► RBAC Guard (Scope) ─► System/Service State Check ─► Input Validation
       ─► Idempotency ─► Eligibility (multi-signal) ─► Risk Engine ─► Limits
       ─► Balance Lock ─► Atomic Tx ─► Audit ─► Notify
```

كل طبقة ترفض بشكل صريح برمز خطأ مقنّن — لا "نجاح افتراضي" في أي مرحلة (R-08).

---

# 9. التكاملات الخارجية (Provider Adapters)

## 9.1 الواجهة المشتركة (Master PLAN §68, §70)

كل مزود يُغلَّف بـ Adapter واحد يحقق واجهة مشتركة:

```
ProviderInterface (لكل نوع خدمة):
  charge(request, idempotency_key) ──► result + external_reference
  refund / reverse(external_reference, amount)
  status(external_reference) ──► الحالة الحقيقية عند الشك
سياسة الفشل + مهلة + Retry مشروط ── قابلة للتهيئة لكل مزود
كل استدعاء يُسجَّل في provider_calls (طلب/استجابة/زمن/نتيجة)
```

| المزود | الواجهة الرئيسية | سياسة الفشل | المراقبة |
|---|---|---|---|
| SMS (OTP) | send_otp(number, hashed_code) | مزودان + فشل القناة لا يمنع المحاولة لاحقاً؛ تنبيه صحة المزود (RK-01) | معدل التسليم لكل مزود + زمن |
| FCM (Push) | push(device_tokens, payload+deep_link) | **إبلاغ فقط** — الفشل لا يمس العملية (R-13) | معدل التسليم + تنظيف التوكن الميت |
| شحن الرصيد (Topup) | charge/status (بالمرجع الخارجي) | Pending → Retry مشروط → Reverse/Refund (القسم 69) | معدل نجاح كل مزود + طابور Pending |
| الفواتير | inquiry(amount مستحق) + pay + status | لا نجاح إلا بنتيجة المزود؛ Refund عند الفشل بعد الخصم | SLA المزود + الفروقات في التسوية |
| شبكات الصرافة (حوالات واردة) | استقبال (Webhook مع تحقق توقيع) + إشعار | مرجع خارجي + Idempotency عند الاستقبال؛ عدم التطابق → حالة مراجعة | مطابقة يومية (reconciliation) |
| الخرائط (Mapbox/Google) | Agent map tiles/search | تنويه؛ الفشل لا يوقف العمليات المالية | توفر الخدمة فقط |
| KYC Storage | S3 signed URLs (ليس مزوداً مالياً) | رفع مع إعادة محاولة عرضية | مساحة/سياسة وصول |

## 9.2 قواعد معمارية للتكامل

1. **لا استدعاء مزود داخل معاملة قاعدة البيانات** المفتوحة (لا اتصال شبكي مع Hold على أقفال wallet) — نمط "Commit ثم استدعاء مع متابعة" للحالات الخارجية، مع حالة PROCESSING/Pending واضحة.
2. **كل استدعاء خارجي له idempotency** خاصة به (Master PLAN §125 قاعدة 6).
3. تغيير مزود = تغيير Adapter فقط — النواة لا تعرف اسم المزود (NFR-MNT-003).
4. **Provider Verification** بند إلزامي في قائمة الإطلاق (Master PLAN §136) — لا خدمة تُفعَّل قبل التحقق من التكامل الحقيقي (R-08، Master PLAN §139).

---

# 10. الأداء وقابلية التوسع

## 10.1 الأهداف (من SRS §6.1 حرفياً — لا اختراع جديد)

| ID | الهدف | التجسيد المعماري |
|---|---|---|
| NFR-PER-001 | زمن استجابة API للعمليات المالية (p95) ≤ 2 ثانية (شبكة 3G جيدة) | معاملة واحدة round-trip للخادم؛ أقفال قصيرة العمر؛ Quote متزامن؛ لا استدعاء مزود متزامن مسدود قبل الرد |
| NFR-PER-002 | فتح الشاشة الرئيسية (بارد) ≤ 2.5 ثانية على جهاز متوسط | كاش عرض محلي + جلب واحد مجمّع (config + balances) + Skeletons |
| NFR-PER-003 | تحديث الرصيد بعد عملية فوري عبر إعادة الجلب من الخادم | إبطال كاش الرصيد عند الكتابة؛ القراءة من Primary للمالك نفسه |
| NFR-PER-004 | Pagination إلزامي (20-50 عنصر/صفحة) | Keyset Pagination في statements والسجلات (C-09) |
| NFR-PER-005 | 1000 طلب/ثانية تصميمياً على Staging | Horizontal scaling للحالات عديمة الحالة + Pooling + أقفال Redis |
| NFR-PER-006 | حجم التطبيق ≤ 40MB أول تثبيت (Android) | ضبط أصول Flutter (شعار/خطوط/أيقونات) بلا مكتبات ثقيلة |

## 10.2 استراتيجية التوسع

```
الحالة عديمة الحالة (Stateless) في خوادم NestJS
  └─► توسّع أفقي خلف LB بلا جلسات لاصقة للطلبات
       │  (JWT self-contained + كل الحالة في PostgreSQL/Redis)

الكاش (Redis):
  ├─ config/remote-config  ── TTL قصير + إبطال عند التغيير
  ├─ balances (قراءة نشطة) ── TTL قصير جداً + إبطال عند الكتابة
  │   (الرصيد "المعروض" كاش؛ الرصيد "الحاكم" دائماً DB)
  └─ rate limiting + عدادات الحدود (استهلاك اليوم)

القراءة:
  ├─ التقارير وكشوف الإدارة ──► من Replica (RO) دائماً
  └─ الأرصدة الحاكمة والكتابة ──► Primary حصراً

البيانات الكبيرة:
  ├─ partitions شهرية لـ transactions و ledger_entries
  ├─ أرشفة قابلة للتهيئة (مع الحفاظ على السجلات — R-14)
  └─ ضغط صور KYC + حدود حجم (Master PLAN §121)

التزامن والأقفال:
  الأصل هو Atomicity داخل PostgreSQL (ACID + FOR UPDATE)
  الأقفال الموزعة (Redis lock) للاستخدامات خارج المعاملة فقط
  (مثل singleton job التسوية) — أو SERIALIZABLE عند اللزوم
```

> **توضيح إلزامي:** قابلية التوسع هنا **لا تعني** توزيع المعاملة المالية نفسها. المعاملة تظل داخل PostgreSQL واحد — التوسع يأتي من توزيع القراءات والتقارير والكاش وتوسيع خوادم API عديمة الحالة (R-03، Master PLAN §15).

---

# 11. النشر والبيئات

## 11.1 البيئات (C-10، Master PLAN §135)

| البيئة | الغرض | البيانات |
|---|---|---|
| Development | تطوير يومي + Docker Compose محلي (app + postgres + redis + minio + wiremock للمزودين) | بيانات صناعية seed — **بيانات الإنتاج ممنوعة** (Master PLAN §135) |
| Staging | اختبار تكامل حقيقي (مزودون sandbox) + E2E + قياس حمل 1000 طلب/ث (NFR-PER-005) | بيانات اختبار معزولة |
| Production | الخدمة الفعلية | حقيقية — R-08 يمنع أي Mock |

## 11.2 Production Topology

```
Internet ─► LB/Nginx (TLS 1.2+)
             ├─► NestJS containers (N ≥ 2, stateless)
             ├─► Admin Web (static/SSR خلف نطاق إداري)
             ├─► PostgreSQL Primary ──streaming──► Replica (RO)
             ├─► Redis (cache + locks)  ── persistence خفيفة
             ├─► S3-compatible (KYC موقّع)
             └─► Backup: يومي + اختبار Restore دوري فعلي
                  (NFR-REL-002 — لا نسخ بلا استعادة تجريبية)
```

## 11.3 CI/CD (NFR-MNT-006)

```
Commit ─► lint ─► unit tests ─► build ─► integrate ─►
  migrate (versioned) ─► deploy staging ─► E2E ─►
  [بوابة موافقة بشرية: صاحب المنتج/المعماري للإنتاج] ─►
  deploy production ─► smoke tests ─► monitor

Migration Principle (Master PLAN §134):
  كل تعديل schema عبر Migration مُصدَّر (versioned) إلزامياً
  — لا تعديل إنتاج يدوياً بلا أثر (NFR-MNT-002)
  الاستراتيجية: forward-compatible (expand → migrate → contract)
```

## 11.4 قائمة إطلاق Production (Master PLAN §136 حرفياً)

| # | البند | معيار النجاح |
|---|---|---|
| 1 | Database Backup | نسخة محدثة + **اختبار Restore ناجح** (لا نسخ بلا استعادة — Master PLAN §123) |
| 2 | Monitoring | APM + صحة الخدمات + طوابير + تنبيهات استباقية |
| 3 | Error Tracking | تتبع أخطاء مع correlation_id لكل طلب (NFR-MNT-005) |
| 4 | Admin Access | أدوار اللوحة مهيأة + MFA مفعّل + أوّل Super Admin موثّق |
| 5 | Rollback Plan | خطة معتمدة (القسم 11.5) ومجرّبة على staging |
| 6 | Provider Verification | كل مزود ممكَّن تم التحقق من تكامله الحقيقي (R-08) |
| 7 | Security Review | مراجعة أمنية + اختبار اختراق + إصلاح الحرجة قبل النشر (NFR-SEC-010) |
| 8 | E2E Test | سيناريوهات القبول AC-01..AC-12 خضراء على staging |
| 9 | Release Build | بناء إنتاج للتطبيق والخادم + توقيع المتاجر (C-05) |

## 11.5 Rollback (Master PLAN §137)

```
مشكلة في إصدار جديد:
  1. Disable affected feature  (Feature Flag — القسم 13 ADR-009)
  2. Force-safe state          (الخدمة ON/OFF/MAINTENANCE — FR-ADM-037)
  3. Backend rollback if applicable
  4. Release corrective version

قاعدة صارمة: لا التلاعب بالمعاملات المكتملة بسبب مشكلة UI
  (التصحيح المالي فقط عبر Reversal/Adjustment الموثّق — R-04)
```

قواعد الإنتاج (Master PLAN §140): يُمنع في بيئة الإنتاج كلٌ من — Fake money، Mock provider، Test account، Hardcoded balance/admin/fee/region list، Fake success state — **ويُوقف الخادم الإقلاع (Boot-time Guard) إذا اكتشف أياً منها**.

---

# 12. المراقبة والاستمرارية (DR)

## 12.1 عزل السجلات الثلاثة (Master PLAN §83، FR-ADM-051)

| السجل | المحتوى | المستهلك | قاعدة |
|---|---|---|---|
| Application Logs | تشغيل الخدمة، أداء، استثناءات تقنية + correlation_id | DevOps/APM | بلا أسرار، بلا بيانات حساسة |
| Security Logs | أحداث أمنية: جهاز جديد، محاولات PIN، Spoof/VPN/محاكي، Revocation | Security Admin | إشارات محرك المخاطر |
| Financial Audit Logs | كل حركة مال وأثر إداري: قبل/بعد + الفاعل + السبب | Auditor (قراءة فقط) | **غير قابل للتعديل/الحذف** (R-14) |

## 12.2 المراقبة (NFR-MNT-004)

- APM: زمن الاستجابة p95 لكل Endpoint (هدف §6.1)، معدلات الأخطاء، عمق طوابير Pending، صحة المزودين.
- تنبيهات إلزامية: `RECONCILIATION_ALERT` (انحراف Ledger/Balance — FR-LDG-010)، نضوب Float وكيل (RK-05)، تعطل مزود (RK-06)، ارتفاع محاولات PIN الفاشلة.
- Error Tracking مع correlation_id يمتد من التطبيق عبر الخادم إلى استدعاء المزود.

## 12.3 سيناريوهات الكوارث الستة (Master PLAN §124) + مسار التعافي

| السيناريو | مسار التعافي (Recovery Path) | الهدف |
|---|---|---|
| فشل قاعدة البيانات | فشل Primary → ترقية Replica يدوية/آلية → استعادة آخر Backup مع WAL → **Reconciliation فوري** (Ledger/Balances) → معالجة العمليات التي كانت PROCESSING عبر سياسة Pending | RPO ≤ 15 دقيقة، RTO ≤ 4 ساعات (NFR-REL-005) |
| فشل مزود خارجي | Adapter يعلّم المزود غير متاح → حالات Pending معلنة → Retry مشروط بالسياسة → Reverse/Refund عند تأكيد الفشل → تنبيه العمليات | لا خصم غير مفسَّر (Master PLAN §69) |
| انهيار التطبيق (App/Server crash) | الحاويات health-check تُعاد؛ أي معاملة قيد التنفيذ ترجع بالكامل (ACID Rollback) أو تكتمل (COMMITTED) — لا حالة غامضة (NFR-REL-004)؛ عند عودة العميل: استعلام الحالة لا طلب جديد | لا ازدواج (Idempotency) |
| فشل الإنترنت/الشبكة | التطبيق: عرض Offline + قائمة انتظار غير مالية (FR-OFF)؛ الخادم يستمر؛ عند العودة: Check Transaction Status أولاً | AC-04 |
| اختراق حساب إداري | إبطال مركزي لكل جلسات الدور (Revocation) → Audit فوري → تدوير الأسرار المرتبطة → مراجعة كل إجراءات الحساب في نافذة الاختراق → تغيير بيانات الدخول + MFA | أثر مالي معدوم — لا مسار `set balance` أصلاً (R-05) |
| ازدواج معاملة | Idempotency يمنعها استباقياً؛ إن حدثت (خلل خارجي): Reconciliation يكشف الانحراف → تجميد الحساب المعني → Reversal موثّق + تحقيق + Audit | AC-03, AC-10 |

> قاعدة عامة: أي انقطاع **لا يترك حالة غامضة** — العمليات المعلقة تنتقل لحالات معروفة قابلة للمعالجة (NFR-REL-004، Master PLAN §67).

---

# 13. سجل القرارات المعمارية (ADR)

| ADR | القرار | الحالة | السياق | البدائل | العواقب |
|---|---|---|---|---|---|
| **ADR-001** | **Node.js + NestJS** للخادم — **حسم C-03** | مقبول | SRS تركت القرار مفتوحاً (C-03: NestJS أو Laravel) | Laravel/PHP، Go، Java Spring | TypeScript موحّد مع نظام Flutter tooling؛ أنواع client/server تتشارك عبر OpenAPI (ADR-011)؛ بيئة تشغيل واحدة؛ DI وحدات NATIVE قوية تناسب Bounded Contexts؛ بيئة توظيف أوسع. العواقب: نموذج خيط واحد لكل عملية — يعالج بتوسيع أفقي + Job Workers؛ انضباط strict TS إلزامي |
| **ADR-002** | **Modular Monolith** بحدود وحدات صارمة | مقبول | فريق صغير + ACID داخل process + Deployment واحد (القسم 6.1) | Microservices، Monolith كلاسيكي بلا حدود | بسيط للنشر والمعاملات الآن؛ الفصل لاحقاً ممكن لكل وحدة حدودها واجهاتها؛ العاقبة: تتطلب مراجعة حدود صارمة (لا imports عابرة) وإلا تتحول لكومة مترابطة |
| **ADR-003** | **PostgreSQL + Double-Entry Ledger** | مقبول | كل قاعدة R-03/R-04، القسم 14–17 من Master PLAN | NoSQL، قواعد محاسبية خارج DB | ACID + FOR UPDATE = ذرّية مضمونة بنياً؛ قيد توازن debits=credits في DB نفسه؛ العاقبة: أداء الكتابة مرهون بقاعدة واحدة — تعالج بالPartitions والقراءة من Replica |
| **ADR-004** | **Redis** للكاش/الجلسات/الأقفال | مقبول | C-04، جلسات إبطال مركزي + Rate Limiting | الكاش داخل DB، Memcached | إبطال مركزي سريع وعدادات حدود خفيفة؛ العاقبة: Redis **ليس مصدر حقيقة** — إسقاطه لا يفقد بيانات مالية (يُبنى من DB) |
| **ADR-005** | **JWT قصير (15د) + Refresh Rotation + Reuse Detection** | مقبول | NFR-SEC-004، FR-AUTH-023 | جلسات خادمية كاملة Cookie | لا حالة لاصقة على الخوادم (توسع أفقي) + كشف إعادة الاستخدام؛ العاقبة: إدارة عائلات refresh بعناية في Redis |
| **ADR-006** | **OTP خادمي hash + TTL + محاولات محدودة** | مقبول | FR-AUTH-001/002، Master PLAN §3 | توليد/تحقق في العميل | لا يمكن التلاعب بالOTP من الجهاز؛ العاقبة: اعتماد كامل على مزود SMS (مخفف بمزودين — RK-01) |
| **ADR-007** | **FCM أساسي + SMS fallback للأحداث الحرجة** | مقبول | A-02، R-13، FR-NTF-006 | SMS فقط، مزود Push بديل | Push رخيص وسريع؛ الفشل لا يمس العمليات (قناة إبلاغ)؛ العاقبة: تنظيم توكنات الأجهزة الميتة |
| **ADR-008** | **S3-compatible موقّع لمستندات KYC** | مقبول | FR-KYC-006، Master PLAN §122 | تخزين داخل DB | DB خفيفة؛ وصول موقّع مؤقت فقط للمدقق المصرّح؛ العاقبة: إدارة مفاتيح الخدمة + تشفير الكائنات الحساسة |
| **ADR-009** | **Remote Config/Feature Flags ضمن حدود القسم 98** | مقبول | Master PLAN §97/§98، FR-ADM-038 | إعدادات في إصدارات التطبيق | تحكم فوري بحالات الخدمة/الإصدارات دون إصدار جديد؛ **العاقبة الإلزامية**: Config للتحكم والسياسات المسموحة فقط — لا يتحول لمنطق مالي مواز (المنطق المالي في الخادم حصراً) |
| **ADR-010** | **Riverpod** لإدارة حالة Flutter | مقبول (قابل للمراجعة قبل Phase 1 نهايتها) | القسم 4.2 | Bloc (بديل موثق المسوغات) | أقل boilerplate + testability قوية؛ العاقبة: التزام code-gen (riverpod_generator) وعدم خلط الحالة مع منطق الأعمال |
| **ADR-011** | **OpenAPI codegen للعميل** (Dart/TS من نفس المواصفة) | مقبول | توحيد أنواع الطرفين مع ADR-001 | كتابة DTOs يدوياً | مصدر واحد للعقد: API doc (خطوة 5) يولّد عملاء Flutter واللوحة؛ يمنع انحراف العقد؛ العاقبة: انضباط تحديث المولّد عند كل تغيير API |
| **ADR-012** | **Docker + CI/CD بأدوار موافقة** | مقبول | §8 SRS، Master PLAN §128/§136/§134 | نشر يدوي | بيئة قابلة للاستنساخ (dev/staging/prod متطابقة بنيوياً — C-10)؛ Migrations مُصدَّرة إلزاماً؛ العاقبة: بوابة موافقة بشرية للإنتاج تُبطئ النشر قليلاً (مقصودة) |

---

# 14. الربط بالخطوات التالية

هذه الوثيقة هي **الأصل الذي تُشتق منه** الوثيقتان التاليتان:

| الخطوة | الوثيقة | ماذا تُشتق من هذه المعمارية | قاعدة الاشتقاق |
|---|---|---|---|
| 4 | **وثيقة قاعدة البيانات** (ERD + DDL) | جدول كل وحدة من §6.2 كياناتها المذكورة → مخطط ERD كامل: أنواع الأعمدة، المفاتيح، القيود (CHECK توازن Ledger، FK — Master PLAN §133: لا Transaction بلا User، لا Ledger Entry بلا Account، لا Fee بلا Transaction)، الفهارس، الPartitions الشهرية (§10.2)، سياسة Immutable rows (R-04/R-14)، ملكية كل جدول لوحدته (§6.1) | حدود الملكية من §6.1 — لا جدول مشترك بين وحدتين |
| 5 | **وثيقة API** (REST Contracts) | لكل وحدة Endpointsها: المصادقة، الصلاحية، Validation، Idempotency where needed، Business Rule، Transaction، Result (Master PLAN §132)؛ صيغة الأخطاء الموحدة (§8)؛ نموذج Quote/Confirm للعمليات المالية (§7.1)؛ Remote Config endpoints (ضمن حدود ADR-009) | كل Endpoint يذكر وحدة الخادم المسؤولة ونمط الحالة (آلة §7.2) |

**كيف يقرأ فريق الخطوة 4/5 هذه الوثيقة:** ابدأ من §6.2 (جدول الوحدات والكيانات) → §7 (مسار المعاملة والأقفال والتوازن) → §6.3 (قواعد التبعية) → §8 (حقول التشفير وصيغة الأخطاء) → §10 (فهارس/Partitions مبدئية) → §13 (حدود ADR-009 وADR-011).

---

# الخاتمة

هذه المعمارية مبنية على مبدأ واحد غير قابل للتفاوض: **الخادم + دفتر الأستاذ مصدر الحقيقة المالية الوحيد** — كل مكون آخر (تطبيق، لوحة، كاش، إشعار) وسيط عرض ونقل وإبلاغ. القرارات الكبرى الثلاثة حُسمت هنا: **NestJS Modular Monolith** (C-03 + ADR-001/002)، **PostgreSQL + Double-Entry Ledger** كقلب (ADR-003)، و**Riverpod** للعميل (ADR-010). أي تعديل معماري لاحق يمر عبر ADR جديد في §13 ولا يخالف جدول §2 (R-01..R-14).

## الموافقة

| الدور | الاسم | التوقيع | التاريخ |
|---|---|---|---|
| صاحب المنتج | | | |
| مدير المشروع | | | |
| المعماري | | | |
| الامتثال والمخاطر | | | |

> **الخطوة التالية (بانتظار الاعتماد):** الخطوة 4 — وثيقة قاعدة البيانات الكاملة (ERD + DDL + Migrations) مشتقة من وحدات §6.2، ثم الخطوة 5 — وثيقة API.
