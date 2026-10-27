/** Browser copy of the API secret redaction used before a project is indexed. */

const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|client[_-]?secret|private[_-]?key|access[_-]?token|secret[_-]?value|password|auth[_-]?token)\b\s*[:=]\s*['"]?[^\s'"]{8,}/gi;
const BEARER_OR_TOKEN =
  /(\bBearer\s+[A-Za-z0-9\-_.]{12,}|\bsk-[A-Za-z0-9]{16,}|\bghp_[A-Za-z0-9]{20,}|\bxox[baprs]-[A-Za-z0-9-]{10,})/gi;
const LONG_TOKEN = /(?<![A-Za-z0-9_\-/=+])[A-Za-z0-9_\-/=+]{48,}(?![A-Za-z0-9_\-/=+])/g;

function looksSecret(candidate: string): boolean {
  if (candidate.split("/").length - 1 >= 2) return false;
  const hasDigit = /\d/.test(candidate);
  const hasUpper = /[A-Z]/.test(candidate);
  return hasDigit && (hasUpper || candidate.includes("-") || candidate.includes("_"));
}

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}: [REDACTED]`)
    .replace(BEARER_OR_TOKEN, "[REDACTED]")
    .replace(LONG_TOKEN, (candidate) => (looksSecret(candidate) ? "[REDACTED]" : candidate));
}
