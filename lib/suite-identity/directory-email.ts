const BOT_PLACEHOLDER_EMAIL_RE = /^bot\+(?:wa|tg)_[^@]+@manubot\.it$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeSuiteDirectoryEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isSuitePlaceholderEmail(value: unknown) {
  return BOT_PLACEHOLDER_EMAIL_RE.test(normalizeSuiteDirectoryEmail(value))
}

export function isRealSuiteDirectoryEmail(value: unknown) {
  const email = normalizeSuiteDirectoryEmail(value)
  return EMAIL_RE.test(email) && !isSuitePlaceholderEmail(email)
}

export function resolveSuiteActivationEmail(input: {
  sourceEmail: unknown
  requestedEmail?: unknown
}) {
  const sourceEmail = normalizeSuiteDirectoryEmail(input.sourceEmail)
  if (!EMAIL_RE.test(sourceEmail)) {
    return { ok: false as const, code: "invalid_source_email" as const }
  }

  if (!isSuitePlaceholderEmail(sourceEmail)) {
    return {
      ok: true as const,
      email: sourceEmail,
      replaceSourceEmail: false,
    }
  }

  const requestedEmail = normalizeSuiteDirectoryEmail(input.requestedEmail)
  if (!requestedEmail) {
    return { ok: false as const, code: "real_email_required" as const }
  }
  if (!isRealSuiteDirectoryEmail(requestedEmail)) {
    return { ok: false as const, code: "invalid_real_email" as const }
  }

  return {
    ok: true as const,
    email: requestedEmail,
    replaceSourceEmail: true,
  }
}
