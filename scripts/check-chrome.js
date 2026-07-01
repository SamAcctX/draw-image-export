/**
 * Post-install sanity check for the Puppeteer-managed Chrome download.
 *
 * Why this exists:
 *   Some Node.js releases (notably 24.16.0 / 24.17.x — see nodejs/node#63487)
 *   silently half-extract the Chrome .zip during Puppeteer's install. The
 *   extraction stops before the large `chrome` binary is written, yet npm
 *   install still exits 0. The breakage only surfaces at runtime as a
 *   "could not find/launch Chrome" error — long after the build "succeeded".
 *
 *   This script turns that silent failure into a loud, build-time failure by
 *   verifying the resolved Chrome executable actually exists and is a
 *   plausible size. It runs as the project `postinstall`, after Puppeteer has
 *   downloaded and extracted Chrome.
 *
 * Opt out (e.g. when Chrome is provided by the system or downloads are
 * intentionally skipped) via any of:
 *   PUPPETEER_SKIP_DOWNLOAD=1
 *   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1   (legacy alias)
 *   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
 *   CHECK_CHROME_SKIP=1
 */

const fs = require('fs');

const TAG = '[check-chrome]';

// A fully-extracted Chrome binary is ~270MB; chrome-headless-shell is smaller
// but still tens of MB. 40MB is a safe floor that a truncated/partial
// extraction will fall under while a real binary comfortably clears.
const MIN_BYTES = 40 * 1024 * 1024;

function truthy(value) {
	return value === '1' || value === 'true';
}

const skip =
	truthy(process.env.PUPPETEER_SKIP_DOWNLOAD) ||
	truthy(process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) ||
	truthy(process.env.CHECK_CHROME_SKIP) ||
	!!process.env.PUPPETEER_EXECUTABLE_PATH;

if (skip) {
	console.log(`${TAG} Skipping Chrome verification (skip/exec-path env set).`);
	process.exit(0);
}

let puppeteer;
try {
	const mod = require('puppeteer');
	puppeteer = mod && mod.default ? mod.default : mod;
} catch (err) {
	// Puppeteer not installed (e.g. `npm install --ignore-scripts` for deps
	// only). Nothing to verify — don't fail the install.
	console.log(`${TAG} Puppeteer not resolvable; skipping check (${err.code || err.message}).`);
	process.exit(0);
}

let execPath;
try {
	execPath = puppeteer.executablePath();
} catch (err) {
	console.error(`${TAG} Could not resolve the Puppeteer Chrome path: ${err.message}`);
	console.error(`${TAG} Ensure Puppeteer installed correctly. If on an affected Node (24.16/24.17.x), reinstall on Node >=24.18.`);
	process.exit(1);
}

if (!fs.existsSync(execPath)) {
	console.error(`${TAG} Chrome binary is MISSING at: ${execPath}`);
	console.error(`${TAG} This is the signature of a half-extracted download (see nodejs/node#63487).`);
	console.error(`${TAG} Fix: use Node >=24.18.0, clear ~/.cache/puppeteer, and reinstall.`);
	process.exit(1);
}

const { size } = fs.statSync(execPath);
if (size < MIN_BYTES) {
	console.error(`${TAG} Chrome binary at ${execPath} is only ${size} bytes ` +
		`(< ${MIN_BYTES}). Likely a truncated/partial extraction.`);
	console.error(`${TAG} Fix: use Node >=24.18.0, clear ~/.cache/puppeteer, and reinstall.`);
	process.exit(1);
}

console.log(`${TAG} OK: Chrome present at ${execPath} (${Math.round(size / (1024 * 1024))} MB).`);
