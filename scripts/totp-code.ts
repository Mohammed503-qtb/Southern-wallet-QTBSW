/**
 * محفظة الجنوب — أداة رمز المصادقة (TOTP) لبيئات التجربة
 * ------------------------------------------------------------
 * تطبع رمز TOTP الحالي لحساب بذور معيّن (سرّه مشتق من APP_KEY في
 * prisma/seed.ts). الاستخدام:
 *   bun scripts/totp-code.ts 770000001
 * للبيئات التجريبية فقط — في الإنتاج العام لا توجد بذور أصلاً
 * (المستخدمون الحقيقيون يملكون أسرارهم في أجهزتهم).
 */
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import {
  base32Encode,
  base32Decode,
  currentTotpCode,
} from "../src/lib/server/totp";

const db = new PrismaClient();

async function main() {
  const phone = process.argv[2];
  if (!phone || !/^7\d{8}$/.test(phone)) {
    console.error("الاستخدام: bun scripts/totp-code.ts <الهاتف 9 أرقام>");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`لا يوجد حساب للهاتف ${phone}`);
    process.exit(1);
  }
  if (user.role === "SYSTEM") {
    console.error("حساب النظام بلا مصادقة");
    process.exit(1);
  }
  const secretBuf = createHmac(
    "sha256",
    process.env.APP_KEY ?? "dev-only-insecure-fallback-app-key!!"
  )
    .update(`seed-totp:${phone}`)
    .digest()
    .slice(0, 20);
  const b32 = base32Encode(secretBuf);
  const code = currentTotpCode(base32Decode(b32));
  const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
  console.log(JSON.stringify({ phone, code, secondsLeft, secret: b32 }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
