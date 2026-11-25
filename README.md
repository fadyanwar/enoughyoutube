# Enough YouTube

A kid-friendly browser extension for Firefox and Chrome that gives children one hour of YouTube a day. When the time is up, YouTube is replaced by a cheerful break page that says it's time to study, with ideas for what to do instead. Every message is kind and free of bad language. It's a sibling of [Fuck Facebook](https://github.com/fadyanwar/fuckfacebook), which uses the same timer but insults you instead.

By default, you get one hour per day across YouTube and YouTube Kids (youtube.com and its subdomains such as m.youtube.com and music.youtube.com, plus youtu.be, youtube-nocookie.com and youtubekids.com). The timer counts time while one of these sites is the active tab in the focused browser window, including paused videos. Background tabs and time with the browser unfocused do not count. After the limit, every open YouTube tab redirects to the break page, and further visits are blocked until the next local calendar day. Usage is saved across browser restarts; time while the browser is closed or the computer is asleep does not count.

A grown-up can change the daily limit and protect it with a **parent PIN**, so children can't raise the limit themselves.

Both browsers run the same code from `src/`. The build adds a manifest for each browser.

## Installation

The extension isn't published in the Firefox Add-ons or Chrome Web Store yet.

### Chrome (and other Chromium browsers)

1. Build the extension (see [Building](#building)).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/chrome` folder.

It needs Chrome 120 or later. Edge, Brave and other Chromium browsers load `dist/chrome` the same way.

### Firefox

For a permanent installation, sign the extension (see [Signing](#signing-for-your-own-firefox-distribution)) and install the `.xpi` from `about:addons` → gear menu → **Install Add-on From File…**.

For testing: open `about:debugging` → **This Firefox** → **Load Temporary Add-on…** and select `dist/firefox/manifest.json`. Firefox removes temporary add-ons when it restarts.

Firefox for Android (142 or later) is supported by the same build. Android has no window focus events, so there the timer counts whenever a YouTube tab is on screen.

### Making it stick on a child's computer

A browser extension can be removed by anyone who can open the extensions page. On a child's device:

- Use a separate browser profile or computer account for the child, without administrator rights.
- Set a parent PIN in the options (below).
- For stronger control, install the extension through browser policy (Chrome `ExtensionInstallForcelist`, Firefox `policies.json` `ExtensionSettings` with `installation_mode: force_installed`) so it can't be removed or disabled, and turn off private/Incognito browsing, where extensions don't run unless allowed.
- This extension limits time; it doesn't filter content. Turn on YouTube's **Restricted Mode** or use YouTube Kids for age-appropriate videos.

## Settings

Open the extension's options:

- **Firefox:** **Preferences** in the Add-ons Manager (`about:addons`).
- **Chrome:** **Details → Extension options** on `chrome://extensions`, or right-click the toolbar icon and choose **Options**.
- **Either browser:** click **Grown-ups: change the daily limit** on the break page.

Set a daily allowance from 1 to 1,440 whole minutes and click **Save**. The default is 60 minutes. Changes apply immediately and keep today's usage. **Reset to one hour** restores the default.

**Parent PIN.** Set a 4–8 digit PIN under **Parent PIN**. Once set, saving or resetting the limit needs the PIN, and changing or removing the PIN needs the current one. The PIN is stored only as a salted SHA-256 hash in the extension's local storage. It's a speed bump for children, not strong security: someone who can open the browser's developer tools or remove the extension can get around it (see [Making it stick](#making-it-stick-on-a-childs-computer)). If you forget the PIN, remove and reinstall the extension.

## How it works

- `background.js` tracks focused-tab time using persistent storage and browser alarms.
- The daily allowance is shared across all YouTube sites and resets at local midnight.
- A browser restart is detected with `storage.session`, so time while the browser is closed is never counted.
- No alarms fire while the computer is asleep, so one update adds at most 90 seconds (the timer normally updates every 30 seconds).
- At the limit, matching tabs redirect to `block.html`, the break page. It says how long was watched, that it's time to study, and shows a new activity idea (read a book, practise spelling, go outside…) every 5 seconds.
- **Close this tab** closes the break page.

The extension doesn't read or change YouTube's pages. Its content script only prints the shared timer status in the page console, so changes to YouTube's markup can't break it.

## Firefox and Chrome differences

| | Firefox | Chrome |
|---|---|---|
| Manifest | MV3, `manifests/base.json` + `manifests/firefox.json` | MV3, `manifests/base.json` + `manifests/chrome.json` |
| Background | Event page (`background.scripts`: `ext.js`, `settings.js`, `background.js`) | Service worker (`background.js` loads `ext.js` and `settings.js` with `importScripts`) |
| API namespace | `browser` (through the `ext` shim) | `chrome` (through the `ext` shim) |
| Minimum version | Firefox 140, Firefox for Android 142 | Chrome 120 |
| Mobile | Firefox for Android supported | No extensions on Chrome for Android |
| Background console | `about:debugging` → **This Firefox** → **Inspect** | `chrome://extensions` → **Inspect views: service worker** |

The behaviour is the same in both browsers. Chrome fires alarms in packed (store-installed) extensions at most every 30 seconds, so the redirect at the deadline can arrive up to 30 seconds late there.

## Permissions and privacy

- `tabs` to identify YouTube tabs and redirect them.
- `storage` to save settings, the PIN hash and usage locally.
- `alarms` to enforce the limit while the background script is suspended.

Host permissions cover the YouTube domains above. They let the page-console diagnostics run on those sites. The extension sends nothing to any server.

## Building

```sh
npm ci
npm run build            # both browsers
npm run build firefox    # or: npm run build chrome
```

The build writes `dist/firefox/` and `dist/chrome/` (loadable folders) and `dist/enoughyoutube-<browser>-<version>.zip` (store-ready packages), with identical output for identical input. The version lives in `manifests/base.json`.

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Build, simulated unit tests, and `web-ext lint` of the Firefox build (warnings fail) |
| `npm run test:chrome` | Loads `dist/chrome` unpacked in headed Chromium (Playwright, under `xvfb-run`) |
| `npm run test:firefox` | Runs `dist/firefox` in a real headless Firefox through `web-ext run` |
| `npm run test:all` | All of the above |

The browser tests use a local stand-in (`tests/fixtures/youtube.html`: a player and an endless list of suggestions) and never contact YouTube.

- **Chrome test** checks: saving a limit; the parent PIN (stored only as a hash, wrong PIN refused, right PIN accepted); other sites not counted; YouTube counted; the page-console countdown; the deadline redirect to the break page and its content; later YouTube Kids visits blocked; **Close this tab**; raising the limit allows YouTube again.
- **Firefox test** checks startup, usage increasing, page-console diagnostics and the alarm redirect.
- **Unit tests** (`tests/*.cjs`) run the built files in Node with mocked browser APIs: limits and invalid settings, live limit changes, focus pause, threshold, midnight, restart and sleep handling, which addresses count as YouTube (and look-alikes that don't), Android, the console countdown, and the build (manifest parity, no HTML-injection sinks, reproducible ZIPs, and **no profanity or insults** in any shipped file).

## Signing for your own Firefox distribution

1. Generate a JWT issuer and secret at https://addons.mozilla.org/developers/addon/api/key/.
2. Run `python3 setup-amo-credentials.py`. It saves `.amo-credentials.json` with owner-only permissions; Git ignores it.
3. `npm ci && npm run build firefox`.
4. Set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` from that file, then run `npx web-ext sign --channel unlisted --source-dir dist/firefox --artifacts-dir web-ext-artifacts`.

The extension ID is `enoughyoutube@fadyanwar.local`. Keep it unchanged across updates, and increase the version in `manifests/base.json` for each submission.

## Why it works

Instead of punishment, this uses **positive redirection**: when time runs out, the child is shown something good to do next rather than a dead end. A predictable daily allowance that resets at midnight is easier to accept than arbitrary cut-offs, and because the extension enforces the limit, parents don't have to be the ones who switch it off.
