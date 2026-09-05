const DEFAULT_TIME_ZONE = "Europe/Rome"

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function dateParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  }
}

export function resolveTenantTimeZone(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/**
 * Returns the UTC instant corresponding to 00:00 of the tenant's current local
 * calendar day. This is deliberately a property-timezone boundary, not a rolling
 * 24-hour window and not an HR shift boundary.
 */
export function getTenantLocalDayStart(now: Date, timeZone: string): Date {
  const safeTimeZone = resolveTenantTimeZone(timeZone)
  const local = dateParts(now, safeTimeZone)
  const desiredUtcClock = Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0)

  // Start from a UTC midnight guess and compensate for the timezone offset. Two
  // passes are enough to converge across DST changes around the target date.
  let guess = desiredUtcClock
  for (let pass = 0; pass < 2; pass += 1) {
    const represented = dateParts(new Date(guess), safeTimeZone)
    const representedUtcClock = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    )
    guess += desiredUtcClock - representedUtcClock
  }

  return new Date(guess)
}
