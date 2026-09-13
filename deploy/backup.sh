#!/usr/bin/env bash
# ============================================================
# محفظة الجنوب — South Wallet | النسخ الاحتياطي لقاعدة SQLite (الإنتاج)
#
# الاستخدام (من جذر المستودع على خادم الإنتاج):
#   bash deploy/backup.sh
#   BACKUP_DIR=/var/backups/south-wallet bash deploy/backup.sh
#
# كرون مقترح (نسخة يومية 02:00 بالتوقيت المحلي للخادم):
#   0 2 * * * cd /opt/south-wallet && BACKUP_DIR=/var/backups/south-wallet \
#             bash deploy/backup.sh >> /var/log/sw-backup.log 2>&1
#
# طريقة العمل:
#  • يتحقق من سلامة القاعدة (PRAGMA integrity_check) قبل النسخ.
#  • ينسخ بأمان عبر sqlite3 .backup (نسخة متسقة حتى والقاعدة نشطة)
#    فإن لم تتوفر أداة sqlite3 يستخدم cp (مع تحذير).
#  • وضعان: مباشر (إن كان ملف القاعدة مرئياً) أو عبر docker compose exec
#    داخل حاوية app (sqlite3 مثبتة في الصورة الإنتاجية).
#  • الدوران: الاحتفاظ بـ 7 نسخ يومية + 4 نسخ أسبوعية
#    (الترقية للأسبوعية: يوم السبت أو أول نسخة بعد غياب أسبوع).
#  • يكتب بصمة sha256 جانبية لكل نسخة إن توفرت الأداة (يتحقق منها restore.sh).
#
# البوابة: NFR-REL-002 (الاسترجاع الموثوق) — يُقترن بـ deploy/restore.sh
# وباختبار استرجاع دوري موثق في docs/DEPLOYMENT.md §4.
# ============================================================
set -euo pipefail

# ===== الإعدادات (قابلة للتجاوز عبر متغيرات البيئة) =====
BACKUP_DIR="${BACKUP_DIR:-./backups}"        # مجلد وجهة النسخ
DB_PATH="${DB_PATH:-/app/db/custom.db}"      # مسار القاعدة (داخل الحاوية)
DAILY_KEEP="${DAILY_KEEP:-7}"                # عدد النسخ اليومية المحفوظة
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"              # عدد النسخ الأسبوعية المحفوظة
WEEKLY_DAY="${WEEKLY_DAY:-6}"                # يوم ترقية النسخة للأسبوعية (6 = السبت)

# جذر مشروع compose (المجلد الحاوي docker-compose.yml)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
BACKUP_LOG="${BACKUP_DIR}/backup.log"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] $*" | tee -a "$BACKUP_LOG"
}

# قفل بسيط يمنع تشغيل نسختين متزامنتين (كرون + تشغيل يدوي)
LOCK_DIR="${BACKUP_DIR}/.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[backup] تحذير: نسخة احتياطية أخرى قيد التشغيل — خروج دون تغيير" >&2
  exit 0
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

# ===== كشف طريقة الوصول إلى قاعدة البيانات =====
MODE=""
if [[ -f "$DB_PATH" ]]; then
  MODE="direct" # داخل الحاوية أو على مضيف يرى الملف مباشرة
elif command -v docker >/dev/null 2>&1 && (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" ps app >/dev/null 2>&1); then
  MODE="compose" # خادم الإنتاج: عبر الحاوية
else
  log "خطأ: لم يُعثر على ملف القاعدة ($DB_PATH) ولا على خدمة app عاملة في $PROJECT_ROOT"
  exit 1
fi
log "وضع النسخ: ${MODE}"

# تشغيل أمر داخل حاوية التطبيق
run_in_app() {
  (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" exec -T app "$@")
}

# نسخ ملف من الحاوية إلى المضيف (docker compose cp مع بديل docker cp)
compose_cp_out() {
  local src="$1" dst="$2"
  if (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" cp "app:${src}" "$dst" 2>/dev/null); then
    return 0
  fi
  local cid
  cid="$(cd "$PROJECT_ROOT" && "$COMPOSE_CMD" ps --all -q app)"
  docker cp "${cid}:${src}" "$dst"
}

STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="sw-db-${STAMP}.db"
DAILY_FILE="${DAILY_DIR}/${NAME}"
TMP_FILE="${DAILY_DIR}/.tmp-${STAMP}.db"

# ===== 1) أخذ النسخة =====
if [[ "$MODE" == "direct" ]]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    # تحقق سلامة المصدر ثم نسخة متسقة عبر أمر .backup الرسمي
    # ‎.timeout 5000‎ = انتظار أقفال الكتابة حتى 5 ثوانٍ (والقاعدة نشطة)
    CHECK="$(sqlite3 "$DB_PATH" ".timeout 5000" "PRAGMA integrity_check;" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$CHECK" != "ok" ]]; then
      log "خطأ: فحص سلامة قاعدة المصدر فشل (النتيجة: ${CHECK:-فارغة}) — لا نسخ احتياطي لقاعدة تالفة"
      exit 1
    fi
    sqlite3 "$DB_PATH" ".timeout 5000" ".backup '${TMP_FILE}'"
    log "نسخة متسقة عبر sqlite3 .backup"
  else
    # احتياط: نسخ مباشر (يوثَّق التحذير) — الأمان يتطلب قاعدة غير نشطة أو WAL
    log "تحذير: أداة sqlite3 غير متوفرة محلياً — نسخ مباشر cp (قد يلتقط لحظة غير متسقة إن كانت القاعدة نشطة)"
    cp -p "$DB_PATH" "$TMP_FILE"
    if [[ -f "${DB_PATH}-wal" ]]; then
      cp -p "${DB_PATH}-wal" "${TMP_FILE}-wal"
    fi
    if [[ -f "${DB_PATH}-shm" ]]; then
      cp -p "${DB_PATH}-shm" "${TMP_FILE}-shm"
    fi
  fi
else
  # وضع compose: التحقق والنسخ داخل الحاوية (sqlite3 مثبتة في الصورة الإنتاجية)
  CHECK="$(run_in_app sqlite3 "$DB_PATH" ".timeout 5000" "PRAGMA integrity_check;" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$CHECK" != "ok" ]]; then
    log "خطأ: فحص سلامة قاعدة المصدر داخل الحاوية فشل (النتيجة: ${CHECK:-فارغة})"
    exit 1
  fi
  run_in_app sqlite3 "$DB_PATH" ".timeout 5000" ".backup '/tmp/sw-backup-source.db'"
  compose_cp_out "/tmp/sw-backup-source.db" "$TMP_FILE"
  run_in_app sh -c 'rm -f /tmp/sw-backup-source.db'
  log "نسخة متسقة عبر sqlite3 .backup داخل الحاوية"
fi

# ===== 2) التحقق من الناتج (حجم + سلامة إن أمكن) =====
if [[ ! -s "$TMP_FILE" ]]; then
  log "خطأ: ملف النسخة الناتج فارغ — فشل غير متوقع"
  rm -f "$TMP_FILE"
  exit 1
fi
if [[ "$MODE" == "direct" ]] && command -v sqlite3 >/dev/null 2>&1; then
  CHECK2="$(sqlite3 "$TMP_FILE" 'PRAGMA integrity_check;' 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$CHECK2" != "ok" ]]; then
    log "خطأ: فحص سلامة النسخة الجديدة فشل — حذفها وعدم اعتمادها"
    rm -f "$TMP_FILE"
    exit 1
  fi
fi

# ===== 2ب) نسخ APP_KEY ومرفوعات KYC مع كل نسخة =====
# APP_KEY (ملف /app/db/.app-key أو APP_KEY_FILE) ووثائق KYC (uploads/kyc)
# جزء لا يتجزأ من الاستعادة: بدون المفتاح لا تُفك أسرار TOTP، وبلا المرفوعات
# يفقد الامتثال وثائقه.
if [[ "$MODE" == "compose" ]]; then
  KEY_SRC="/app/db/.app-key"
  if run_in_app test -f "$KEY_SRC"; then
    compose_cp_out "$KEY_SRC" "${DAILY_DIR}/app-key-${STAMP}"
    chmod 600 "${DAILY_DIR}/app-key-${STAMP}" 2>/dev/null || true
    log "نُسخ ملف APP_KEY مع النسخة"
  fi
  UP_DST="${DAILY_DIR}/uploads-${STAMP}.tar.gz"
  if run_in_app test -d /app/uploads; then
    if run_in_app sh -c 'tar czf /tmp/sw-uploads.tar.gz -C /app uploads 2>/dev/null'; then
      compose_cp_out "/tmp/sw-uploads.tar.gz" "$UP_DST"
      run_in_app sh -c 'rm -f /tmp/sw-uploads.tar.gz'
      log "نُسخ أرشيف وثائق KYC مع النسخة"
    fi
  fi
else
  if [[ -f "${DB_PATH%/custom.db}/.app-key" ]]; then
    cp -p "${DB_PATH%/custom.db}/.app-key" "${DAILY_DIR}/app-key-${STAMP}"
    log "نُسخ ملف APP_KEY مع النسخة"
  fi
  if [[ -d ./uploads ]]; then
    tar czf "${DAILY_DIR}/uploads-${STAMP}.tar.gz" -C . uploads 2>/dev/null && log "نُسخ أرشيف وثائق KYC مع النسخة" || true
  fi
fi

# ===== 3) الإقرار بالنسخة (اسم نهائي + بصمة sha256) =====
mv -f "$TMP_FILE" "$DAILY_FILE"
if [[ -f "${TMP_FILE}-wal" ]]; then
  mv -f "${TMP_FILE}-wal" "${DAILY_FILE}-wal"
fi
if [[ -f "${TMP_FILE}-shm" ]]; then
  mv -f "${TMP_FILE}-shm" "${DAILY_FILE}-shm"
fi
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$DAILY_DIR" && sha256sum "$NAME" >"${NAME}.sha256")
fi
log "تمت النسخة اليومية: ${DAILY_FILE} ($(du -h "$DAILY_FILE" | cut -f1))"

# ===== 4) الترقية إلى نسخة أسبوعية (السبت أو أول نسخة بعد غياب أسبوع) =====
PROMOTE=0
if [[ "$(date +%u)" == "$WEEKLY_DAY" ]]; then
  PROMOTE=1
fi
# نسخ أسبوعية أحدث من 6 أيام؟ (جمع النتائج بدل grep -q لتفادي فخ pipefail+SIGPIPE)
RECENT_WEEKLY="$(find "$WEEKLY_DIR" -maxdepth 1 -name 'sw-db-*.db' -mtime -6 2>/dev/null || true)"
if [[ -z "$RECENT_WEEKLY" ]]; then
  PROMOTE=1
fi
if [[ "$PROMOTE" == "1" ]]; then
  cp -p "$DAILY_FILE" "${WEEKLY_DIR}/${NAME}"
  if [[ -f "${DAILY_DIR}/${NAME}.sha256" ]]; then
    cp -p "${DAILY_DIR}/${NAME}.sha256" "${WEEKLY_DIR}/${NAME}.sha256"
  fi
  log "تمت الترقية إلى نسخة أسبوعية: ${WEEKLY_DIR}/${NAME}"
fi

# ===== 5) الدوران: حذف الزائد عن سياسة الاحتفاظ =====
# الأسماء طابع زمني (YYYYMMDD-HHMMSS) فالترتيب اللفظي = الترتيب الزمني
prune_keep_n() {
  local dir="$1" keep="$2" f
  find "$dir" -maxdepth 1 -name 'sw-db-*.db' 2>/dev/null | sort -r | tail -n "+$((keep + 1))" |
    while IFS= read -r f; do
      rm -f -- "$f" "${f}.sha256" "${f}-wal" "${f}-shm"
      log "دوران: حذف نسخة قديمة ${f}"
    done
}
prune_keep_n "$DAILY_DIR" "$DAILY_KEEP"
prune_keep_n "$WEEKLY_DIR" "$WEEKLY_KEEP"

# دوران الملفات المرافقة (APP_KEY + أرشيفات المرفوعات) بنفس سياسة الاحتفاظ
prune_side_files() {
  local dir="$1" keep="$2"
  for pattern in 'app-key-*' 'uploads-*.tar.gz'; do
    find "$dir" -maxdepth 1 -name "$pattern" 2>/dev/null | sort -r | tail -n "+$((keep + 1))" |
      while IFS= read -r f; do
        rm -f -- "$f"
        log "دوران: حذف ${f}"
      done
  done
}
prune_side_files "$DAILY_DIR" "$DAILY_KEEP"
prune_side_files "$WEEKLY_DIR" "$WEEKLY_KEEP"

# ===== 6) ملخص ختامي =====
DAILY_COUNT="$(find "$DAILY_DIR" -maxdepth 1 -name 'sw-db-*.db' 2>/dev/null | wc -l | tr -d ' ')"
WEEKLY_COUNT="$(find "$WEEKLY_DIR" -maxdepth 1 -name 'sw-db-*.db' 2>/dev/null | wc -l | tr -d ' ')"
log "اكتمل: يوميات=${DAILY_COUNT}/${DAILY_KEEP} أسبوعيات=${WEEKLY_COUNT}/${WEEKLY_KEEP} في ${BACKUP_DIR}"
log "تذكير (NFR-REL-002): اختبر الاسترجاع دورياً — bash deploy/restore.sh --drill <ملف-نسخة>"
exit 0
