const DEFAULT_LIMIT_MINUTES = 60;

function getLimitMinutes(value) {
  return Number.isInteger(value) && value >= 1 && value <= 1440
    ? value
    : DEFAULT_LIMIT_MINUTES;
}

// "1 hour", "45 minutes", "1 hour 30 minutes".
function describeMinutes(minutes) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest || !hours) parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

// Parent PIN: 4 to 8 digits, stored only as a salted SHA-256 hash ({ salt, hash }, hex strings).
const PIN_PATTERN = /^\d{4,8}$/;

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return toHex(digest);
}

async function makePinRecord(pin) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hashPin(pin, salt) };
}

async function pinMatches(record, pin) {
  if (!record) return true; // no PIN set
  return typeof pin === "string" && PIN_PATTERN.test(pin) && (await hashPin(pin, record.salt)) === record.hash;
}
