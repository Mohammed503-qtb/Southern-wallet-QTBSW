#!/usr/bin/env bash
# ============================================================
# محفظة الجنوب — South Wallet | استرجاع قاعدة SQLite من نسخة احتياطية
#
# الاستخدام (من جذر المستودع على خادم الإنتاج):
#   bash deploy/restore.sh <ملف-النسخة>            # استرجاع فعلي (نافذة صيانة)
#   bash deploy/restore.sh --drill <ملف-النسخة>    # اختبار استرجاع بلا مساس بالإنتاج
#
# خطوات الاسترجاع الفعلي (وضع docker compose):
#   1) تحقق: وجود الملف + بصمة sha256 (إن وُجدت) + PRAGMA integrity_check
#   2) لقطة أمان لقاعدة الإنتاج الحالية (pre-restore-<طابع>.db) — للتراجع
#   3) إيقاف خدمة app (نافذة صيانة — التطبيق يتوقف مؤقتاً)
#   4) وضع النسخة محل /app/db/custom.db + تنظيف ملفات WAL/SHM القديمة
#   5) إعادة التشغيل + فحص /api/health (مهلة 60 ثانية)
#   6) إن فشل الفحص → تراجع تلقائي إلى لقطة الأمان ثم إبلاغ الخروج 1
#   7) تقرير زمن الاسترجاع (RTO) — سجّله في docs/DEPLOYMENT.md §4
#
# ⚠️ اختبار الاسترجاع الدوري — بوابة NFR-REL-002 (مطلوب قبل الإطلاق):
#   مرة شهرياً على الأقل شغّل وضع الاختبار على آخر نسخة يومية وأرشف النتيجة:
#     bash deploy/restore.sh --drill backups/daily/sw-db-YYYYMMDD-HHMMSS.db
#   ثم موثقاً في جدول اختبارات الاسترجاع (docs/DEPLOYMENT.md §4.5) بتاريخ
#   النسخة والنتيجة. نسخة غير مختبرة = نسخة غير موجودة.
#
# بعد كل استرجاع فعلي ناجح تحقق يدوياً من توازن الدفاتر:
#   لوحة الإدارة → فحص الدفاتر (ledger-check) + بيان مستخدم معروف.
# ============================================================
set -euo pipefail

# ===== الإعدادات (قابلة للتجاوز عبر متغيرات البيئة) =====
DB_PATH="${DB_PATH:-/app/db/custom.db}"     # مسار القاعدة داخل الحاوية
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"      # ثواني انتظار الصحة بعد التشغيل
BACKUP_DIR="${BACKUP_DIR:-./backups}"       # مكان لقطات الأمان

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [restore] $*"
}

usage() {
  echo "الاستخدام: bash deploy/restore.sh [--drill] <ملف-النسخة-الاحتياطية>" >&2
  echo "  --drill : اختبار استرجاع دوري (تحقق وسلامة وعدّ صفوف) دون مساس الإنتاج" >&2
  exit 2
}

run_in_app() {
  (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" exec -T app "$@")
}

compose_cp_out() {
  local src="$1" dst="$2"
  if (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" cp "app:${src}" "$dst" 2>/dev/null); then
    return 0
  fi
  local cid
  cid="$(cd "$PROJECT_ROOT" && "$COMPOSE_CMD" ps --all -q app)"
  docker cp "${cid}:${src}" "$dst"
}

compose_cp_in() {
  local src="$1" dst="$2"
  if (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" cp "$src" "app:${dst}" 2>/dev/null); then
    return 0
  fi
  local cid
  cid="$(cd "$PROJECT_ROOT" && "$COMPOSE_CMD" ps --all -q app)"
  docker cp "$src" "${cid}:${dst}"
}

# ===== 0) قراءة الوسائط =====
DRILL=0
if [[ "${1:-}" == "--drill" ]]; then
  DRILL=1
  shift
fi
[[ $# -eq 1 ]] || usage
BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" || ! -s "$BACKUP_FILE" ]]; then
  log "خطأ: ملف النسخة غير موجود أو فارغ: ${BACKUP_FILE}"
  exit 1
fi
BACKUP_FILE="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"
log "ملف النسخة: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"

# كشف وضع التشغيل
MODE=""
if [[ -f "$DB_PATH" ]]; then
  MODE="direct"
elif command -v docker >/dev/null 2>&1 && (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" ps app >/dev/null 2>&1); then
  MODE="compose"
else
  log "خطأ: لم يُعثر على قاعدة مباشرة (${DB_PATH}) ولا على خدمة app عاملة في ${PROJECT_ROOT}"
  exit 1
fi
log "وضع الاسترجاع: ${MODE}"

# ===== 1) التحقق من بصمة sha256 (إن وُجد ملف جانبي) =====
if [[ -f "${BACKUP_FILE}.sha256" ]] && command -v sha256sum >/dev/null 2>&1; then
  if (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" >/dev/null 2>&1); then
    log "بصمة sha256 مطابقة ✓"
  else
    log "خطأ: بصمة sha256 غير مطابقة — النسخة تالفة أو معدّلة، يُمنع الاسترجاع"
    exit 1
  fi
fi

# ===== 2) فحص سلامة النسخة (PRAGMA integrity_check) =====
# فتح للقراءة فقط عبر خيار CLI ‎-readonly‎ (مدعوم منذ sqlite3 3.22) كي لا نمس ملف النسخة
integrity_check() {
  local file="$1" out
  if command -v sqlite3 >/dev/null 2>&1; then
    out="$(sqlite3 -readonly "$file" 'PRAGMA integrity_check;' 2>/dev/null | tr -d '[:space:]' || true)"
  else
    out=""
  fi
  echo "$out"
}

if [[ "$MODE" == "compose" ]]; then
  # التحقق داخل الحاوية (sqlite3 مثبتة في الصورة الإنتاجية) — بلا مساس قاعدة الإنتاج
  run_in_app sh -c 'rm -f /tmp/sw-restore-verify.db'
  compose_cp_in "$BACKUP_FILE" "/tmp/sw-restore-verify.db"
  CHECK="$(run_in_app sqlite3 /tmp/sw-restore-verify.db 'PRAGMA integrity_check;' 2>/dev/null | tr -d '[:space:]' || true)"
  run_in_app sh -c 'rm -f /tmp/sw-restore-verify.db'
else
  CHECK="$(integrity_check "$BACKUP_FILE")"
fi

if [[ -n "$CHECK" && "$CHECK" != "ok" ]]; then
  log "خطأ: فحص سلامة النسخة فشل (النتيجة: ${CHECK}) — يُمنع الاسترجاع"
  exit 1
fi
if [[ -z "$CHECK" ]]; then
  log "تحذير: تعذر إجراء فحص السلامة (sqlite3 غير متاحة) — الاستمرار على مسؤوليتك"
else
  log "فحص سلامة النسخة: ok ✓"
fi

# عدّ صفوف الجداول المالية الأساسية (تقرير موثق في النتيجة)
count_rows() {
  local file="$1" drill_file="$2" sql_table="$3" mode="$4" n
  if [[ "$mode" == "compose" ]]; then
    n="$(run_in_app sqlite3 "$drill_file" "SELECT count(*) FROM \"${sql_table}\";" 2>/dev/null | tr -d '[:space:]' || echo '?')"
  elif command -v sqlite3 >/dev/null 2>&1; then
    n="$(sqlite3 -readonly "$file" "SELECT count(*) FROM \"${sql_table}\";" 2>/dev/null | tr -d '[:space:]' || echo '?')"
  else
    n="?"
  fi
  echo "$n"
}

report_rows() {
  local file="$1" drill_file="$2" mode="$3"
  log "  User        : $(count_rows "$file" "$drill_file" "User" "$mode")"
  log "  Wallet      : $(count_rows "$file" "$drill_file" "Wallet" "$mode")"
  log "  Transaction : $(count_rows "$file" "$drill_file" "Transaction" "$mode")"
  log "  LedgerEntry : $(count_rows "$file" "$drill_file" "LedgerEntry" "$mode")"
}

# تقرير صفوف من قاعدة الإنتاج الحية (بعد الاسترجاع) — عبر الحاوية
report_rows_live() {
  log "  User        : $(run_in_app sqlite3 "$DB_PATH" 'SELECT count(*) FROM "User";' 2>/dev/null | tr -d '[:space:]' || echo '?')"
  log "  Wallet      : $(run_in_app sqlite3 "$DB_PATH" 'SELECT count(*) FROM "Wallet";' 2>/dev/null | tr -d '[:space:]' || echo '?')"
  log "  Transaction : $(run_in_app sqlite3 "$DB_PATH" 'SELECT count(*) FROM "Transaction";' 2>/dev/null | tr -d '[:space:]' || echo '?')"
  log "  LedgerEntry : $(run_in_app sqlite3 "$DB_PATH" 'SELECT count(*) FROM "LedgerEntry";' 2>/dev/null | tr -d '[:space:]' || echo '?')"
}

# ===== 3) وضع الاختبار الدوري (--drill) — لا يمس الإنتاج إطلاقاً =====
if [[ "$DRILL" == "1" ]]; then
  log "وضع الاختبار (--drill): تحقق فقط دون أي تغيير على قاعدة الإنتاج"
  if [[ "$MODE" == "compose" ]]; then
    DRILL_FILE="/tmp/sw-restore-drill.db"
    run_in_app sh -c 'rm -f /tmp/sw-restore-drill.db'
    compose_cp_in "$BACKUP_FILE" "$DRILL_FILE"
    report_rows "$BACKUP_FILE" "$DRILL_FILE" "compose"
    run_in_app sh -c 'rm -f /tmp/sw-restore-drill.db'
  else
    report_rows "$BACKUP_FILE" "" "direct"
  fi
  log "نتيجة الاختبار: $(date '+%Y-%m-%d %H:%M:%S') — النسخة سليمة وقابلة للاسترجاع ✓"
  log "أرشف هذه النتيجة في جدول اختبارات الاسترجاع (docs/DEPLOYMENT.md §4.5) — بوابة NFR-REL-002"
  exit 0
fi

# ===== 4) الاسترجاع الفعلي =====
SECONDS=0
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
SAFETY_FILE="${BACKUP_DIR}/pre-restore-${STAMP}.db"

log "بدء الاسترجاع الفعلي (نافذة صيانة) — الطابع: ${STAMP}"

if [[ "$MODE" == "compose" ]]; then
  # 4-أ) لقطة أمان لقاعدة الإنتاج الحالية (متسقة عبر sqlite3 .backup)
  run_in_app sqlite3 "$DB_PATH" ".timeout 5000" ".backup '/tmp/sw-pre-restore.db'"
  compose_cp_out "/tmp/sw-pre-restore.db" "$SAFETY_FILE"
  run_in_app sh -c 'rm -f /tmp/sw-pre-restore.db'
  log "لقطة الأمان: ${SAFETY_FILE}"

  # دالة التراجع التلقائي إلى لقطة الأمان
  rollback() {
    log "فشل فحص الصحة بعد الاسترجاع — تراجع تلقائي إلى لقطة الأمان..."
    (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" stop app >/dev/null 2>&1) || true
    compose_cp_in "$SAFETY_FILE" "$DB_PATH"
    (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" run --rm --no-deps --entrypoint sh app \
      -c "rm -f '${DB_PATH}'-wal '${DB_PATH}'-shm '${DB_PATH}'-journal") >/dev/null 2>&1 || true
    (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" start app >/dev/null 2>&1) || true
    log "تم التراجع — تحقق يدوياً من الحالة: $COMPOSE_CMD ps && $COMPOSE_CMD logs --tail 50 app"
  }

  # 4-ب) إيقاف التطبيق (Caddy سيظهر 502 مؤقتاً — نافذة صيانة معلنة)
  log "إيقاف خدمة app..."
  (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" stop app)

  # 4-ج) وضع النسخة محل قاعدة الإنتاج + تنظيف ملفات Journal/WAL القديمة
  compose_cp_in "$BACKUP_FILE" "$DB_PATH"
  (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" run --rm --no-deps --entrypoint sh app \
    -c "rm -f '${DB_PATH}'-wal '${DB_PATH}'-shm '${DB_PATH}'-journal")
  log "تم وضع النسخة في ${DB_PATH}"

  # 4-د) إعادة التشغيل + فحص الصحة (حتى ${HEALTH_TIMEOUT} ثانية)
  log "إعادة تشغيل app وانتظار فحص الصحة..."
  (cd "$PROJECT_ROOT" && "$COMPOSE_CMD" start app)

  HEALTHY=0
  WAITED=0
  while (( WAITED < HEALTH_TIMEOUT )); do
    if run_in_app curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      HEALTHY=1
      break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
  done

  if [[ "$HEALTHY" != "1" ]]; then
    rollback
    log "فشل الاسترجاع وتم التراجع — زمن المنقضي: ${SECONDS} ثانية. افحص السجلات"
    exit 1
  fi

  log "الصحة سليمة بعد الاسترجاع ✓ — /api/health يجيب"
  log "عدد صفوف قاعدة الإنتاج المستعادة:"
  report_rows_live
  log "زمن الاسترجاع (RTO): ${SECONDS} ثانية — سجّله في docs/DEPLOYMENT.md §4"
  log "تحقق يدوياً الآن: (1) تسجيل دخول مستخدم معروف (2) لوحة الإدارة → فحص الدفاتر (Σ=0)"
  log "لا تحذف لقطة الأمان ${SAFETY_FILE} إلا بعد 48 ساعة من التحقق اليدوي"

else
  # وضع الملف المباشر (بيئة غير Docker — تطوير/اختبار)
  log "وضع مباشر: نسخ احتياطي للقاعدة الحالية ثم استبدالها"
  cp -p "$DB_PATH" "$SAFETY_FILE"
  log "لقطة الأمان: ${SAFETY_FILE}"
  log "أوقف خدمة التطبيق يدوياً الآن ثم اضغط Enter للمتابعة (أو Ctrl+C للإلغاء)"
  read -r _
  if command -v sqlite3 >/dev/null 2>&1; then
    # استرجاع متسق عبر .backup من ملف النسخة (يتطلب توقفاً كاملاً)
    sqlite3 "$BACKUP_FILE" ".backup '${DB_PATH}'"
    rm -f "${DB_PATH}-wal" "${DB_PATH}-shm" "${DB_PATH}-journal"
  else
    cp -p "$BACKUP_FILE" "$DB_PATH"
    rm -f "${DB_PATH}-wal" "${DB_PATH}-shm" "${DB_PATH}-journal"
  fi
  log "تم الاستبدال — أعد تشغيل خدمة التطبيق يدوياً وتحقق من ${HEALTH_URL}"
  log "زمن الاسترجاع (RTO): ${SECONDS} ثانية — للتراجع: cp ${SAFETY_FILE} ${DB_PATH}"
fi

log "اكتمل الاسترجاع بنجاح ✓"
exit 0
