const form = document.getElementById("settings");
const minutes = document.getElementById("minutes");
const status = document.getElementById("status");
const save = document.getElementById("save");
const reset = document.getElementById("reset");
const pinCheck = document.getElementById("pin-check");
const pin = document.getElementById("pin");
const pinForm = document.getElementById("pin-form");
const pinState = document.getElementById("pin-state");
const currentPinRow = document.getElementById("current-pin-row");
const currentPin = document.getElementById("current-pin");
const newPin = document.getElementById("new-pin");
const setPin = document.getElementById("set-pin");
const removePin = document.getElementById("remove-pin");
const pinStatus = document.getElementById("pin-status");
let parentPin = null;

function showPinState() {
  const locked = Boolean(parentPin);
  pinCheck.hidden = currentPinRow.hidden = removePin.hidden = !locked;
  pin.required = currentPin.required = locked;
  pin.disabled = !locked;
  setPin.textContent = locked ? "Change PIN" : "Set PIN";
  pinState.textContent = locked
    ? "A parent PIN is set. Enter it to change the limit."
    : "Set a PIN so children cannot change the limit themselves.";
}

async function load() {
  try {
    const stored = await ext.storage.local.get(["dailyLimitMinutes", "parentPin"]);
    minutes.value = getLimitMinutes(stored.dailyLimitMinutes);
    parentPin = stored.parentPin || null;
    showPinState();
    minutes.disabled = save.disabled = reset.disabled = setPin.disabled = false;
  } catch {
    status.textContent = "Could not load settings. Reload this page to try again.";
  }
}

async function saveLimit(value) {
  if (!(await pinMatches(parentPin, pin.value))) {
    status.textContent = "That PIN is not right. Ask a grown-up.";
    pin.value = "";
    return;
  }
  save.disabled = reset.disabled = true;
  try {
    await ext.storage.local.set({ dailyLimitMinutes: value });
    minutes.value = value;
    pin.value = "";
    status.textContent = `Saved: ${value} ${value === 1 ? "minute" : "minutes"} per day.`;
  } catch {
    status.textContent = "Could not save settings. Please try again.";
  } finally {
    save.disabled = reset.disabled = false;
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (form.reportValidity()) saveLimit(Number(minutes.value));
});
reset.addEventListener("click", () => {
  if (!parentPin || pin.reportValidity()) saveLimit(DEFAULT_LIMIT_MINUTES);
});

pinForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!pinForm.reportValidity()) return;
  if (!(await pinMatches(parentPin, currentPin.value))) {
    pinStatus.textContent = "The current PIN is not right.";
    return;
  }
  try {
    parentPin = await makePinRecord(newPin.value);
    await ext.storage.local.set({ parentPin });
    pinStatus.textContent = "PIN saved. You will need it to change the limit.";
  } catch {
    pinStatus.textContent = "Could not save the PIN. Please try again.";
  }
  currentPin.value = newPin.value = "";
  showPinState();
});

removePin.addEventListener("click", async () => {
  if (!currentPin.reportValidity()) return;
  if (!(await pinMatches(parentPin, currentPin.value))) {
    pinStatus.textContent = "The current PIN is not right.";
    return;
  }
  await ext.storage.local.remove("parentPin");
  parentPin = null;
  currentPin.value = newPin.value = "";
  pinStatus.textContent = "PIN removed. Anyone can change the limit now.";
  showPinState();
});

load();
