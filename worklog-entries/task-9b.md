# Task ID: 9-b — سجل العمل
## خدمات المرحلة 2: سداد الفواتير + شحن الرصيد + كروت الشبكة (خلفية وواجهة كاملة)

### الخطوات

1. قراءة worklog.md كاملاً (خصوصاً Task 9-0: القناة الاحتياطية x-sw-session + عقد المرحلة 2) ثم docs/MVP_CONTRACT.md (الغلاف/الأخطاء/Idempotency/محرك الدفتر) ثم دراسة الأنماط الذهبية حرفياً: transfers/quote + transfers + remittances (route() wrapper، requireUser، assertNotFrozen، assertInScope، verifyPin خارج المعاملة، getFeeRule/computeFee، assertDailyLimit، postEntries Σ=0، findIdempotentTx/assertSamePayload/idmMeta، notify) + شاشات remittance-create/transfer/cash-deposit (الخطوات form→review→pin→result/fail، PinStep، ReviewCard، ReceiptCard، postMoney بAC-04، refreshMe بعد العملية، toast) + api-hooks (useApiData) + money-shared (PhoneField/BigCodeCard/errInfo).
2. إنشاء `src/lib/server/payments-catalog.ts` (ملك 9-b): 12 مزوّد فواتير يمنياً واقعياً في 5 فئات (كهرباء عدن/لحج/كهرماء، مياه عدن/لحج، يمن موبايل/PTC، يمن نت/أدن نت/Engnet، مرور عدن/بلدية عدن) + 4 مشغلين (You 73/74، MTN 77/78، سبأفون 71/72، يمن موبايل 70/76) بفئات ثابتة + 15 باقة كروت بيانات بأسعار ثابتة + دوال البحث/التحقق (billerByCode/assertValidAccountNumber/operatorByCode/phoneMatchesOperator/cardByCode/isPackageAllowed) + المبلغ المستحق المحاكى الحتمي (sha256 للمزود:الرقم → 3,000..25,000 مقربة لـ25) + dueLabel + generateCardCode (11 خانة من أبجدية بلا لبس محلية) + getPaymentsFeeRule/peekPaymentsFeeMinor (FeeRule حية، تجنّب تعديل money.ts المغلق) + مصمّمات Views.
3. المسارات الخمسة الجديدة (كلها بنمط transfers الحرفي):
   - GET /api/bills → BillerView[] بالرسوم الحية (50 ر.ي)؛ +وضع ?ref= لاسترجاع metadata فاتورة عملية BILL_PAY.
   - POST /api/bills/preview {billerCode, accountNumber} → تحقق صيغة (SYS-001 بطول محدد) → BillPreviewView بمستحق حتمي + dueLabel؛ BIL-001 للمزود المجهول.
   - POST /api/bills/pay {…, pin} + Idempotency-Key → تحقق كامل (رصيد TXN-001، حدود TXN-002، PIN خارج المعاملة) → معاملة BILL_PAY (ref BP-…): [MAIN DEBIT a+f]+[FEE CREDIT f]+[SUSPENSE CREDIT a] Σ=0 → metadata {billerCode, billerName, accountNumber, dueAmountMinor, dueLabel, idmHash} + notify + writeAudit → BillPayResultView؛ قيود: المبلغ ≤ المستحق دائماً والمزود غير المفتوح (GOV/TELECOM/INTERNET) يستقبل السداد الكامل فقط.
   - GET/POST /api/topup → مشغلون بفئات ورسوم (15 ر.ي)؛ POST يتحقق من بادئة الرقم للمشغل + الفئة ضمن packagesMinor (TOP-001) → معاملة TOPUP (ref TU-…) بنفس القيود → metadata {phone, operatorCode, operatorName} + ?ref= للاسترجاع.
   - GET/POST /api/cards → 15 باقة (feeMinor حقل إضافي فوق CardProductView لعرضه في المراجعة)؛ POST {productCode, pin} + Idempotency → توليد رمز كرت 11 خانة يخزن في metadataJson ويعاد في الاستجابة (cardCode) + يظهر في الإشعار → معاملة CARD_PURCHASE (ref NC-…) + ?ref= لاسترجاع الرمز.
4. الاستثناء المسموح الوحيد على ملف غير ملكي: transactions/route.ts — إضافة BILL_PAY/TOPUP/CARD_PURCHASE إلى VALID_TYPES فقط (الفلتر types= كان قائماً) بلا مس أي سلوك آخر. والاستثناء الثاني: transaction-details-screen.tsx — إضافة فقط: 3 useApiData شرطية (?ref= على مساراتي) لجلب metadata + صفوف «رقم الحساب/الرقم المشحون/الباقة» بنمط الحقول القائم + بطاقة CardCodeBox داكنة ذهبية بزر نسخ وتحذير لعمليات CARD_PURCHASE.
5. prisma/seed-phase2-payments.ts (idempotent بمراجع ثابتة BP-/TU-/NC-P2XXXX01 + فحص الوجود أولاً): FeeRules الثلاثة (فاتورة 50 ثابتة، شحن 15، كرت 10 بYER) + 3 معاملات تاريخية لأحمد عبر postEntries (فاتورة كهرباء 23456789 قبل 4 أيام بمستحقها الحتمي 5,000+50، شحن MTN 1,000+15 قبل يومين، كرت يُو ميز 9,000+10 قبل يوم برمز مولّد) بإشعارات تاريخية + تفعيل ServiceState: BILLS/TOPUP/NETWORK_CARDS → ON «خدمة Beta مفعلة» + تحقق ledgerCheck نهائياً. شُغّل مرتين (الثانية تخطّت كل شيء = idempotency ✓) — رصيد أحمد YER صار 220,397 ثم تغير بالاختبارات.
6. استبدال الشاشات المؤقتة الأربع كاملة (نمط remittance/transfer الحرفي: mx-auto 440px، ScreenHeader، خطوات، loading/تعطيل أزرار بdisabledReason، InlineErrorBanner، ErrorState بالكود، PinStep بمعالجة PIN-001/PIN-002، postMoney، ReceiptCard، SuccessMark، toast، refreshMe):
   - bills-screen: بحث معرّب + أقسام الفئات الخمس بأيقونات (Zap/Droplets/Phone/Wifi/Landmark) + «آخر مدفوعاتك» (types=BILL_PAY، النقر يعيد فتح المزود مع تمليء الحساب من الوصف) + ملاحظة المحاكاة.
   - bill-pay-screen: إدخال حساب (inputMode numeric، طول مشتق من التلميح، تمليء من params.account) → استعلام → بطاقة المستحق + dueLabel + خيارا «المستحق كاملاً»/«مبلغ مخصص» (للمفتوحة فقط، AmountPad) → مراجعة (رسوم/إجمالي/رصيد + تنبيه جزئي) → PIN → إيصال كامل.
   - topup-screen: شبكة المشغلين (بادئات معروضة) → تبويبا «لهذا الهاتف» (رقمي مع تحقق البادئة)/«رقم آخر» (PhoneField+AmountPad) + فئات chips → مراجعة → PIN → إيصال.
   - cards-screen: باقات مجمعة بالمشغل (بطاقات سعر + رسوم) → مراجعة (feeMinor الحي) → PIN → BigCodeCard للرمز بQR ونسخ + تحذير «لن يظهر الرمز مرة أخرى إلا في تفاصيل العملية» + إيصال.
7. تحقق شامل (lint نظيف؛ curl بجلسة x-sw-session؛ متصفح agent-browser سطح مكتب + جوال 390px؛ VLM):
   - curl: كتالوجات الثلاثة ✓؛ preview صحيح/خطأ صيغة/BIL-001 ✓؛ حتمية المستحق (17225 مرتين) ✓؛ pay ناجح + replay بنفس المفتاح = نفس المرجع + TXN-003 عند حمولة مختلفة ✓؛ PIN-001 ✓؛ TOP-001 (فئة/منتج) ✓؛ رقم لا يتبع المشغل (SYS-001 واضح) ✓؛ TXN-001 لفاطمة ✓؛ TXN-002 لفاطمة (بعد تحويل 40,000 حقيقي من أحمد لها عبر API) ✓؛ GEO-001 لسامي ✓؛ شراء كرت + replay = نفس cardCode ✓؛ ?ref= الثلاثة ✓؛ types=BILL_PAY/TOPUP,CARD_PURCHASE ✓؛ ledger-check balanced=true (147 قيداً/52 مجموعة) ✓.
   - متصفح: دخول أحمد → الخدمات (الفواتير/الشحن/الكروت متاحة بلا شريحة «قريباً») → سداد فاتورة كاملة حتى الإيصال (حساب مملّأ من آخر المدفوعات) → تفاصيل العملية تعرض رقم الحساب → شحن 500 لرقمه → شراء كرت سبأفون يومي → رمز الكرت ظاهر بزر نسخ → تفاصيل العملية تعرض رمز الكرت نفسه المخزن (6CEKTVG4TME) مع التحذير → جوال 390px بلا تجاوز أفقي (scrollWidth=390) → VLM: RTL سليم، هوية أسود/ذهبي، لا أزرق، لا عيوب.
   - لقطات محفوظة: worklog-attachments/9b/ (7 لقطات سطح مكتب + 2 جوال).
   - ملاحظة: أثناء الجلسة توقف الخادم مرة (عملية dev قُتلت خارجياً — dev.log سليم بلا أخطاء) فأُعيد تشغيله bun run dev؛ وتكرار Fast Refresh من تعديلات الوكلاء المتوازيين أعاد التوجيه للرئيسية مرتين أثناء الاختبار (سلوك dev معروف، بلا أثر وظيفي).

### المخرجات
- الخلفية: payments-catalog.ts (كتالوج+تحقق+رسوم+رموز) + 5 مسارات API (bills/bills-preview/bills-pay/topup/cards) بقيود Σ=0 كاملة عبر محرك postEntries — لا أي تعديل رصيد مباشر.
- البيانات: seed-phase2-payments.ts (رسوم + 3 معاملات تاريخية متوازنة + تفعيل الخدمات ON).
- الواجهة: 4 شاشات كاملة (bills/bill-pay/topup/cards) + إثراء transaction-details بالأنواع الجديدة.
- إضافة نظامية وحيدة: 3 أنواع في VALID_TYPES بفلتر معاملات المستخدم.

### القرارات
1. وجهة مبلغ الخدمة في الدفتر: SUSPENSE:YER (بانتظار تسوية المزود) — أصوب من FEE لأنه ليس رسماً، ويحاكي التسوية دون تكامل خارجي (D-01). Σ=0 محفوظ ومتحقق منه إدارياً.
2. بادئات المراجع: BP- (فاتورة)، TU- (شحن)، NC- (كرت) — امتداد لنمط SW/RM/CW بلا أي اعتماد برمجي على البادئة.
3. استرجاع رمز الكرت في تفاصيل العملية: عبر ?ref= على مساراتي الخاصة (transactions/[ref] وapi-types مغلقان أمامي) بدل تعديل أي ملف مشترك — الحل الوحيد المتوافق مع ملكية الملفات، ويخدم التحذير «لن يظهر الرمز إلا في التفاصيل».
4. رسوم الشاشات: تُقرأ حية من الخادم (biller.feeMinor وoperator.feeMinor وfeeMinor الإضافي على CardProductView) لا قيم ثابتة في الواجهة — تحرير M10 يسري فوراً.
5. المزودات غير المفتوحة (اتصالات/إنترنت/حكومي): سداد كامل فقط؛ الكهرباء/المياه: تسمح بسداد جزئي ≤ المستحق — يحاكي الواقع اليمني ويُفصح عنه في المراجعة.
6. بطاقة الخدمة في الرئيسية (home quick tile) تفتح ServiceInfoSheet «متاحة» بدل التنقل المباشر — سلوك home-screen.tsx (ملك 8-b، مغلق أمامي) للخدمات ذات stateKey عموماً؛ المسار الذهبي عبر شاشة الخدمات يعمل مباشرة. تُرك للمنسق/9-d إن رأوا تعديله.
