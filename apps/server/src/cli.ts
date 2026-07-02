import "./config/load-env.js";
import qrcode from "qrcode-terminal";
import {
  createPairingSession,
  listDeviceSessions,
  revokeDeviceSession,
} from "./modules/auth/auth-routes.js";

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function usage() {
  console.log(`Codex H5 Remote Controller

Usage:
  npm run pair --workspace apps/server -- [http://host:5173]
  npm run pair --workspace apps/server -- --url http://host:5173
  npm run devices:list --workspace apps/server -- [--limit 20|--all]
  npm run devices:revoke --workspace apps/server -- <sessionId>

Environment:
  PUBLIC_CONTROLLER_URL=http://host:5173  Public URL encoded into pairing QR codes
`);
}

function printPairingQr() {
  const publicUrl = argValue("--url") ?? (process.argv[3]?.startsWith("http") ? process.argv[3] : undefined);
  const pairing = createPairingSession({ publicUrl });

  console.log("\nScan to pair Codex Controller\n");
  qrcode.generate(pairing.qrUrl, { small: true }, (output) => {
    console.log(output);
  });
  console.log(`Pairing URL: ${pairing.qrUrl}`);
  console.log(`QR ID: ${pairing.qrId}`);
  console.log(`Expires at: ${pairing.expiresAt}`);
  console.log("\nOnly a phone that opens this URL and confirms pairing will receive a controller session.\n");
}

function printDevices() {
  const limit = Number(argValue("--limit") ?? 20);
  const devices = process.argv.includes("--all") ? listDeviceSessions() : listDeviceSessions().slice(0, limit);

  if (devices.length === 0) {
    console.log("No paired devices.");
    return;
  }

  console.table(
    devices.map((device) => ({
      sessionId: device.sessionId,
      status: device.status,
      deviceName: device.deviceName,
      lastSeenAt: device.lastSeenAt,
      expiresAt: device.expiresAt,
      revokedAt: device.revokedAt ?? "",
    })),
  );

  if (!process.argv.includes("--all")) {
    console.log(`Showing ${devices.length} most recent device sessions. Use --all or --limit N to change this.`);
  }
}

function revokeDevice() {
  const sessionId = process.argv[3];

  if (!sessionId) {
    console.error("Missing sessionId.");
    process.exitCode = 1;
    return;
  }

  const revoked = revokeDeviceSession(sessionId);

  if (!revoked) {
    console.log(`No active device session was revoked for ${sessionId}.`);
    return;
  }

  console.log(`Revoked device session ${sessionId}.`);
}

const command = process.argv[2];

switch (command) {
  case "pair":
    printPairingQr();
    break;
  case "devices:list":
    printDevices();
    break;
  case "devices:revoke":
    revokeDevice();
    break;
  default:
    usage();
    process.exitCode = command ? 1 : 0;
}
