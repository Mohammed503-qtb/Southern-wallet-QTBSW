#!/usr/bin/env bash
# ============================================================
# محفظة الجنوب — South Wallet | نقطة دخول حاوية التطبيق (الإنتاج)
#
# المهام:
#   1) التحقق من متغير DATABASE_URL (يأتي من .env.production عبر env_file)
#   2) التحقق من وجود ملف قاعدة البيانات في وحدة التخزين (/app/db)
#   3) إن غاب الملف → إنشاء المخطط عبر bunx prisma db push --accept-data-loss
#   4) تشغيل خادم Next standalone عبر bun (exec ليصبح PID الرئيسي)
#
# ملاحظة: لا قاعدة بيانات داخل الصورة — المخطط يُنشأ عند أول تشغيل فقط،
# ثم تُستخدم نفس الملف عبر وحدة التخزين المسماة app-db في كل إعادة تشغيل.
# ============================================================
set -euo pipefail

log() {
  echo "[docker-entrypoint] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

# --- 1) متغير البيئة الإلزامي ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  log "خطأ: DATABASE_URL غير مضبوط — مرِّره عبر .env.production (env_file في docker-compose.yml)"
  exit 1
fi
log "DATABASE_URL=${DATABASE_URL}"

# --- 2) استنتاج مسار ملف قاعدة البيانات من DATABASE_URL ---
# صيغة Prisma: file:<مسار> — المسارات النسبية تُحل نسبة إلى مجلد المخطط /app/prisma
DB_PATH="${DATABASE_URL#file:}"
if [[ -z "$DB_PATH" ]]; then
  DB_PATH="/app/db/custom.db"
fi
if [[ "$DB_PATH" != /* ]]; then
  DB_PATH="/app/prisma/${DB_PATH}"
fi
DB_DIR="$(dirname "$DB_PATH")"
log "مسار قاعدة البيانات: ${DB_PATH}"

# --- 3) ضمان وجود المجلد (وحدة التخزين مركّبة على /app/db) ---
mkdir -p "$DB_DIR"

# --- 4) إنشاء المخطط عند أول تشغيل فقط ---
if [[ -f "$DB_PATH" ]]; then
  log "ملف قاعدة البيانات موجود — تخطي إنشاء المخطط"
else
  log "ملف قاعدة البيانات غير موجود — إنشاء المخطط عبر bunx prisma db push (أول تشغيل)"
  # المسار الأساسي: bunx مع الإدخال المحلي node_modules/.bin/prisma
  # الاحتياط: تنفيذ ملف الـCLI مباشرة إن تعذر bunx (نفس الشجرة المثبتة محلياً)
  if ! bunx prisma db push --accept-data-loss --schema /app/prisma/schema.prisma --skip-generate; then
    log "تعذر bunx — محاولة تنفيذ أداة prisma مباشرة"
    bun /app/node_modules/prisma/build/index.js db push \
      --accept-data-loss --schema /app/prisma/schema.prisma --skip-generate
  fi
  if [[ -f "$DB_PATH" ]]; then
    log "تم إنشاء مخطط قاعدة البيانات بنجاح"
  else
    log "خطأ: لم يُنشأ ملف قاعدة البيانات — تحقق من DATABASE_URL ومن أذونات وحدة التخزين /app/db"
    exit 1
  fi
fi

# --- 5) معالجة HOSTNAME ---
# خادم Next standalone يستمع على HOSTNAME، وDocker يعيّنه افتراضياً بمعرّف
# الحاوية — نضبط الربط على كل الواجهات داخل الحاوية (الصحيح خلف وكيل عكسي)
# ما لم يضبط المستخدم HOSTNAME صراحةً إلى قيمة أخرى في .env.production
if [[ -z "${HOSTNAME:-}" || "${HOSTNAME}" == "$(cat /etc/hostname 2>/dev/null || true)" ]]; then
  export HOSTNAME="0.0.0.0"
  log "HOSTNAME=0.0.0.0 (الاستماع على كل الواجهات داخل الحاوية)"
fi

# --- 6) تشغيل الخادم (exec ليستلم الإشارات مباشرة) ---
log "تشغيل الخادم على المنفذ ${PORT:-3000} ..."
exec bun /app/.next/standalone/server.js
