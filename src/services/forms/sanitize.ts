import crypto from "crypto";

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "span", "div",
]);

export function sanitizeRichText(input: string | null | undefined) {
  if (!input) return "";
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, tag: string) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      if (name === "a") {
        const href = /href="(https?:\/\/[^"]+)"/i.exec(match);
        return href ? `<a href="${href[1]}" rel="noopener noreferrer">` : "<a>";
      }
      if (match.startsWith("</")) return `</${name}>`;
      return `<${name}>`;
    });
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenKey() {
  return crypto.createHash("sha256").update(process.env.JWT_SECRET || "form-token").digest();
}

export function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptToken(payload: string) {
  const buffer = Buffer.from(payload, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashIp(ip: string | undefined) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function slugKey(label: string) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `${base || "question"}_${crypto.randomBytes(3).toString("hex")}`;
}

export function signCaptcha(answer: string, expiresAt: number) {
  const secret = process.env.JWT_SECRET || "form-captcha";
  const payload = Buffer.from(JSON.stringify({ answer, expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyCaptcha(token: string, given: string) {
  const secret = process.env.JWT_SECRET || "form-captcha";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    answer: string;
    expiresAt: number;
  };
  if (Date.now() > data.expiresAt) return false;
  return data.answer.trim().toLowerCase() === given.trim().toLowerCase();
}

export function stripJpegExif(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const pieces: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      pieces.push(buffer.subarray(offset));
      return Buffer.concat(pieces);
    }
    const size = buffer.readUInt16BE(offset + 2);
    const isExif = marker === 0xe1;
    if (!isExif) pieces.push(buffer.subarray(offset, offset + 2 + size));
    offset += 2 + size;
  }
  return buffer;
}

const IMAGE_MAGIC: Array<{ type: string; bytes: number[] }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export function detectImage(buffer: Buffer) {
  for (const magic of IMAGE_MAGIC) {
    const matches = magic.bytes.every((byte, index) => buffer[index] === byte);
    if (!matches) continue;
    if (magic.type === "image/webp") {
      const brand = buffer.subarray(8, 12).toString("ascii");
      if (brand !== "WEBP") return null;
    }
    return magic.type;
  }
  return null;
}
