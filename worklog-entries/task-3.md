# Task ID: 3 — سجل عمل وكيل كتابة وثيقة المعمارية

Agent: general-purpose
Task: كتابة وثيقة "المعمارية التقنية الكاملة — System Architecture" لمشروع محفظة الجنوب في docs/ARCHITECTURE.md

## Work Log

- قراءة `worklog.md` كاملاً (الخطوة 1: SRS مكتملة في docs/SRS.md — 951 سطراً، عارض ويب RTL جاهز).
- قراءة `docs/SRS.md` كاملاً بالتدريج (951 سطراً): §1.3 نظرة المنظومة، §1.6 القواعد R-01..R-14، §2.4 القيود C-01..C-10، §4 المتطلبات الوظيفية للعميل (FR-AUTH/KYC/WLT/LDG/TRF/REM/PAY/BIL/TOP/CWD/SAV/NWC/STM/NTF/FAV/SUP/ACC/CRY/OFF)، §5 FR-ADM، §6 NFR (خصوصاً أهداف الأداء §6.1 حرفياً)، §8 التقنيات والمعمارية المقيدة، §9 معايير القبول AC-01..AC-12، الملاحق (آلات الحالة، مصفوفة الأدوار، خريطة MoSCoW).
- قراءة المرجع الحاكم `upload/Pasted Content_1789156753860.txt` (3485 سطراً) بالأقسام المطلوبة: §1–3 (الهدف/المنصات/قاعدة الخادم مصدر الحقيقة)، §14–17 (Ledger/Atomicity/Idempotency/حالات المعاملة)، §62–70 (المخاطر/الجلسات/Offline/التكاملات/فشل المزود)، §71–77 (كيانات ومراجع قاعدة البيانات)، §78–84 (حماية الإدارة/الأسرار/الأخطاء/Logging)، §96–98 (مصدر الحقيقة الموحد/Remote Config)، §120–124 (الأداء/التخزين/النسخ/Disaster Recovery)، §125–141 (قواعد كسر المنطق/DoD/ترتيب المراحل/Architecture/Repository/API/Database/Migration/Environment/الإطلاق/Rollback/قواعد الإنتاج)، §142–152 (التدفقات الكلية والمبدأ النهائي).
- كتابة `docs/ARCHITECTURE.md` (743 سطراً) وفق الهيكل المطلوب بالكامل:
  - بطاقة وثيقة بنمط SRS (المعيار: C4 Model مكيف + ADR).
  - §1 المقدمة (الغرض/الجمهور/المرجعية/كيف تُقرأ).
  - §2 جدول R-01..R-14 → الانعكاس المعماري الملموس لكل قاعدة.
  - §3 نظرة C4-Level 1: رسم ASCII (Flutter + Admin + LB + NestJS Modular Monolith + PostgreSQL Primary/Replica + Redis + S3 + مزودون) + جدول 8 مكونات + قنوات الاتصال.
  - §4 معمارية Flutter: 4 طبقات، Riverpod (ADR-010) مع جدول مقارنة Bloc، Secure Storage للـ tokens فقط، Offline عرض + قائمة انتظار غير مالية، Deep Links، حِزم Mockable.
  - §5 لوحة الإدارة: React/Next.js RTL منفصلة على نفس REST API + MFA + Maker-Checker.
  - §6 الخادم: قرار Modular Monolith (ADR-002) مع تبرير 4 نقاط + جدول 24 وحدة Bounded Contexts (identity…provider-adapters) بكياناتها + قواعد التبعية (interfaces لا implementations) + قالب بناء وحدة جديدة (R-09).
  - §7 محرك المعاملات: التدفق الذري 9 خطوات (Idempotency_keys → Validation → FOR UPDATE → Debit → Fee → Credit → ledger_entries مزدوج → status history → Commit → Notify) + آلة الحالة ASCII + جدول معالجة الفشل بين الخطوات + سياسة فشل المزود (Pending/Retry/Reverse/Refund — §69) + Reversal/Adjustment (R-04/R-05).
  - §8 الأمان: TLS/JWT 15د + Refresh Rotation + Reuse Detection/OTP خادمي/Argon2id/AES-256-GCM + KMS/Secret Manager/Rate Limiting/بصمة جهاز/RBAC Guards/MFA/مضاد التلاعب + خط الدفاع للطلب المالي.
  - §9 جدول Provider Adapters (SMS/FCM/شحن/فواتير/صرافة/خرائط/KYC Storage) + 4 قواعد تكامل.
  - §10 الأداء: أهداف SRS §6.1 حرفياً + استراتيجية التوسع (Stateless أفقي، كاش Redis، Replica للقراءة، Partitions شهرية، ACID داخل PostgreSQL كأساس).
  - §11 النشر: 3 بيئات منفصلة (C-10)، Production Topology، CI/CD (lint→test→build→migrate→deploy→smoke) ببوابة موافقة، Migrations versioned (§134)، قائمة إطلاق §136 (9 بنود)، Rollback §137.
  - §12 المراقبة: عزل السجلات الثلاثة (§83) + سيناريوهات الكوارث الستة (§124) بجدول Recovery Path.
  - §13 سجل ADR كامل: 12 قراراً (ADR-001 NestJS حسم C-03 … ADR-012 Docker+CI/CD) بحالة/سياق/بدائل/عواقب.
  - §14 الربط بالخطوة 4 (قاعدة البيانات) والخطوة 5 (API) + خاتمة وجدول موافقة بنمط SRS.
- مراجعة وتصحيح: إصلاح رسم §3 ليصبح التدفق صحيحاً (التطبيق + اللوحة كلاهما عبر LB)، إصلاح نصوص مكسورة (الـ Saga، مع Hold، تلك الوثيقتان، وقيد مزدوج)، استبدال معيار "التعارض" بـ"التوافق" في جدول Riverpod، تصويب عبارة Boot-time Guard لقواعد الإنتاج §140.
- التحقق النهائي: 743 سطراً (ضمن 700–950)، لا HTML ولا Mermaid، الرسوم ASCII فقط، لا كود تطبيق فعلي (أمثلة زائفة قصيرة فقط)، لم تُعدَّل ملفات أخرى، لم تُشغَّل خوادم أو build/lint.

## Stage Summary

- المخرجات: `docs/ARCHITECTURE.md` (743 سطراً، 14 قسماً + بطاقة + خاتمة/موافقة).
- القرارات المعمارية المثبتة:
  1. **حسم C-03 (ADR-001):** Node.js + NestJS رسمياً — TypeScript موحّد مع منظومة Flutter، أنواع client/server تتشارك عبر OpenAPI codegen (ADR-011)، بيئة واحدة، DI وحدات قوية تناسب Bounded Contexts.
  2. **ADR-002: Modular Monolith** بحدود 24 وحدة صارمة (Bounded Contexts) قابلة للفصل لخدمات لاحقاً — تبرير: فريق صغير، Atomicity داخل process واحد، Deployment واحد، R-03.
  3. **ADR-010: Riverpod** لإدارة حالة Flutter (البديل Bloc موثق المسوغات، قابل للمراجعة قبل نهاية Phase 1 فقط).
- مرجعية القرارات مربوطة حرفياً بـ R-XX (SRS §1.6)، C-XX (SRS §2.4)، أهداف NFR-PER حرفياً من SRS §6.1، وأقسام Master PLAN المرقمة (§3, §14–17, §65–70, §78–84, §96–98, §124–141, §142–149).
- الحالة: **الخطوة 3 (المعمارية) مكتملة — بانتظار الاعتماد للانتقال إلى الخطوة 4 (وثيقة قاعدة البيانات ERD/DDL) ثم الخطوة 5 (وثيقة API)، وكلاهما يُشتق من جدول الوحدات §6.2 وقواعد §6.3/§7/§8.**
