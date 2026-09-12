# syntax=docker/dockerfile:1
# ============================================================
# محفظة الجنوب — South Wallet | com.janoub.wallet
# Dockerfile النشر الإنتاجي (متعدد المراحل على صور oven/bun:1)
#
#   builder → تثبيت التبعيات + prisma generate + بناء Next standalone
#   runner  → صورة تشغيل نظيفة بمستخدم غير جذري (لا قاعدة بيانات داخل الصورة)
#
# قاعدة البيانات (SQLite) تُنشأ عند أول تشغيل داخل وحدة تخزين مسماة
# (app-db → /app/db) عبر deploy/docker-entrypoint.sh — DATABASE_URL
# يُمرَّر وقت التشغيل فقط من .env.production (env_file في docker-compose.yml).
#
# ملاحظات معمارية مثبتة بالتجربة المحلية:
#  • سكربت build في package.json يبني standalone وينسخ .next/static و public داخله.
#  • محركات Prisma (debian-openssl-3.0.x) تحتاج libssl.so.3 → تثبيت openssl في runner.
#  • bunx prisma يحتاج إدخال node_modules/.bin/prisma (سيملاينك) + إغلاق
#    التبعيات الكامل (35 حزمة) — جُهِّز شجرة مغلقة في مرحلة البناء ونُقلت كما هي.
#  • البذور (prisma/seed*.ts) تستورد ../src/lib/server/* بمسارات نسبية
#    → ننسخ src/ و tsconfig.json إلى الصورة لتشغيلها عبر
#    docker compose exec app bun prisma/seed.ts (اختياري — للتجربة فقط).
#  • عارض الوثائق الداخلي يقرأ docs/*.md من process.cwd()/docs
#    → ننسخ docs/ إلى /app/docs.
# ============================================================

# ---------------- المرحلة 1: البناء (builder) ----------------
FROM oven/bun:1 AS builder
WORKDIR /app

# طبقة التبعيات القابلة للتخزين المؤقت (تثبيت مع تجميد bun.lock)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# باقي المصدر (يحترم .dockerignore: بلا node_modules/.next/.git/db/.env*)
COPY . .

# متغيرات وقت البناء فقط — مرحلة مستقلة فلا تدخل الصورة النهائية:
# DATABASE_URL هنا عنوان وهمي لا يُستخدم (لا استعلامات أثناء next build)
ENV DATABASE_URL="file:/tmp/build-placeholder.db" \
    NEXT_TELEMETRY_DISABLED=1

# توليد عميل Prisma (يستخدم المحركات المنزّلة محلياً في node_modules)
RUN bunx prisma generate

# البناء الإنتاجي: next build + نسخ .next/static و public داخل standalone
# (هذا ما يفعله سكربت build في package.json حرفياً)
RUN bun run build

# تجهيز شجرة node_modules «مغلقة» لأدوات Prisma فقط:
#   CLI (prisma) + العميل (@prisma/client) + المحركات (@prisma/engines)
#   + .prisma/client المولَّد + تبعياتها المتعدية (35 حزمة)
# تُنقل وحدها إلى مرحلة التشغيل كي يعمل bunx prisma db push داخل
# الحاوية دون تثبيت كامل التبعيات ودون اتصال بالشبكة.
RUN <<'EOT'
set -eu
mkdir -p /prisma-shim/node_modules/.bin
cat > /tmp/mkclosure.js <<'JS'
const fs = require("fs");
const path = require("path");
const NM = "/app/node_modules";
const DEST = "/prisma-shim/node_modules";
const seen = new Set();
const queue = ["prisma", ".prisma", "@prisma/client"];
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const pkgDir = path.join(NM, name);
  if (!fs.existsSync(pkgDir)) continue;
  const dest = path.join(DEST, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(pkgDir, dest, { recursive: true });
  const pj = path.join(pkgDir, "package.json");
  if (fs.existsSync(pj)) {
    const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
    for (const dep of Object.keys(deps)) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
}
console.log("prisma closure packages:", seen.size);
JS
bun /tmp/mkclosure.js
rm -f /tmp/mkclosure.js
# إدخال bin كسيملاينك (وليس نسخة ملف) — وإلا يفشل تحديد مسار wasm داخل CLI
ln -s ../prisma/build/index.js /prisma-shim/node_modules/.bin/prisma
EOT

# ---------------- المرحلة 2: التشغيل (runner) ----------------
FROM oven/bun:1 AS runner
WORKDIR /app

# curl: فحص الصحة / sqlite3: النسخ الاحتياطي داخل الحاوية (sqlite3 .backup)
# openssl: يوفر libssl.so.3 المطلوبة لمحركات Prisma على Debian
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl \
      sqlite3 \
      ca-certificates \
      openssl \
 && rm -rf /var/lib/apt/lists/*

# مستخدم غير جذري مخصص
RUN groupadd --system bun \
 && useradd --system --gid bun --create-home --shell /usr/sbin/nologin bun

# خادم Next standalone (يشمل .next/static و public داخل مجلده)
COPY --from=builder --chown=bun:bun /app/.next/standalone /app/.next/standalone

# تراكب شجرة أدوات Prisma فوق /app/node_modules (إصدار مطابق لمرحلة البناء)
# يجعل bunx prisma يعمل محلياً من /app دون أي تنزيل وقت التشغيل
COPY --from=builder --chown=bun:bun /prisma-shim/node_modules /app/node_modules

# المخطط والبذور — prisma db push عند أول تشغيل + بذور اختيارية للتجربة
COPY --from=builder --chown=bun:bun /app/prisma /app/prisma

# مصدر التطبيق الخادمي + tsconfig — تستوردهما البذور عبر مسارات نسبية ../src
COPY --from=builder --chown=bun:bun /app/src /app/src
COPY --from=builder --chown=bun:bun /app/tsconfig.json /app/tsconfig.json

# وثائق المشروع — يقرؤها عارض الوثائق الداخلي من process.cwd()/docs
COPY --from=builder --chown=bun:bun /app/docs /app/docs

# package.json الحقيقي (prisma ضمن dependencies) — يمنع bunx من الجلب من الشبكة
COPY --from=builder --chown=bun:bun /app/package.json /app/package.json

# سكربت الدخول (إنشاء المخطط عند أول تشغيل ثم تشغيل الخادم)
COPY --chown=bun:bun deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# مجلد وحدة التخزين — مملوك مسبقاً للمستخدم bun حتى ينجح أول إنشاء
# (عند أول تركيب volume فارغ ينسخ Docker محتوى المجلد وملكيته كما هي)
RUN mkdir -p /app/db && chown bun:bun /app/db

# متغيرات التشغيل الافتراضية — DATABASE_URL غائب عمداً (وقت التشغيل فقط
# من .env.production). HOSTNAME لأن Docker يعيّنه بمعرّف الحاوية افتراضياً
# والخادم standalone يربط عليه — 0.0.0.0 هو الصحيح داخل الحاوية خلف وكيل عكسي.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

USER bun
EXPOSE 3000

# فحص الصحة: /api/health يعيد 200 مع {db:true} أو 503 عند تعذر قاعدة البيانات
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
