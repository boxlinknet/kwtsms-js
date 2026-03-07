#!/usr/bin/env node
/**
 * kwtsms CLI — command-line interface for the kwtSMS API
 *
 * Usage:
 *   kwtsms setup
 *   kwtsms verify
 *   kwtsms balance
 *   kwtsms senderid
 *   kwtsms coverage
 *   kwtsms send <mobile> <message> [--sender SENDER_ID]
 *   kwtsms status <msg-id>
 *   kwtsms validate <number> [number2 ...]
 */

import { createInterface } from 'node:readline';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { KwtSMS, type BulkSendResult } from './client.js';
import { loadEnvFile } from './env.js';
import { apiRequest } from './request.js';

const TEST_MODE_WARNING = `
  ⚠  TEST MODE: message will be queued but NOT delivered to the handset.
     No SMS credits will be consumed.
     Run 'kwtsms setup' and choose Live mode to send real messages.
`;

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const rl = createInterface({ input: process.stdin, terminal: false });
    // Try raw mode for password masking
    const stdin = process.stdin;
    let input = '';
    const wasRaw = stdin.isRaw;
    try { stdin.setRawMode(true); } catch { /* TTY not available */ }
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char: string) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        try { stdin.setRawMode(wasRaw ?? false); } catch { /* ignore */ }
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (char === '\u007f' || char === '\b') {
        if (input.length > 0) input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function runSetup(envFile = '.env'): Promise<void> {
  console.log('\n── kwtSMS Setup ──────────────────────────────────────────────────');
  console.log('Verifies your API credentials and creates a .env file.');
  console.log('Press Enter to keep the value shown in brackets.\n');

  const existing = loadEnvFile(envFile);

  // Username
  const defaultUser = existing['KWTSMS_USERNAME'] ?? '';
  const username =
    (await ask(defaultUser ? `API Username [${defaultUser}]: ` : 'API Username: ')) || defaultUser;

  // Password (hidden)
  const defaultPass = existing['KWTSMS_PASSWORD'] ?? '';
  let password: string;
  if (defaultPass) {
    const raw = await askHidden('API Password [keep existing]: ');
    password = raw || defaultPass;
  } else {
    password = await askHidden('API Password: ');
  }

  if (!username || !password) {
    console.error('\nError: username and password are required.');
    process.exit(1);
  }

  // Verify credentials
  process.stdout.write('\nVerifying credentials... ');
  try {
    const data = await apiRequest('balance', { username, password }); // logFile intentionally omitted — setup calls are not logged
    if (data.result !== 'OK') {
      console.log(`FAILED\nError: ${String(data.description ?? data.code ?? 'Unknown error')}`);
      process.exit(1);
    }
    console.log(`OK  (Balance: ${String(data['available'] ?? '?')})`);
  } catch (e) {
    console.log(`FAILED\nError: ${(e as Error).message}`);
    process.exit(1);
  }

  // Fetch Sender IDs
  process.stdout.write('Fetching Sender IDs... ');
  let senderIds: string[] = [];
  try {
    const sidData = await apiRequest('senderid', { username, password }); // logFile intentionally omitted — setup calls are not logged
    if (sidData.result === 'OK') {
      senderIds = (sidData['senderid'] as string[]) ?? [];
    }
  } catch { /* ignore */ }

  let senderId: string;
  if (senderIds.length > 0) {
    console.log('OK');
    console.log('\nAvailable Sender IDs:');
    senderIds.forEach((sid, i) => console.log(`  ${i + 1}. ${sid}`));
    const defaultSid = existing['KWTSMS_SENDER_ID'] ?? senderIds[0];
    const choice = await ask(`\nSelect Sender ID (number or name) [${defaultSid}]: `);
    const num = parseInt(choice, 10);
    senderId =
      !isNaN(num) && num >= 1 && num <= senderIds.length
        ? senderIds[num - 1]
        : choice || defaultSid;
  } else {
    console.log('(none returned)');
    const defaultSid = existing['KWTSMS_SENDER_ID'] ?? 'KWT-SMS';
    senderId = (await ask(`Sender ID [${defaultSid}]: `)) || defaultSid;
  }

  // Send mode
  console.log('\nSend mode:');
  console.log('  1. Test mode  — messages queued but NOT delivered, no credits consumed  [default]');
  console.log('  2. Live mode  — messages delivered to handsets, credits consumed');
  const currentMode = existing['KWTSMS_TEST_MODE'] ?? '1';
  const modeDefault = currentMode !== '0' ? '1' : '2';
  const modeChoice = (await ask(`\nChoose [${modeDefault}]: `)) || modeDefault;
  const testMode = modeChoice === '2' ? '0' : '1';

  if (testMode === '1') {
    console.log('  → Test mode selected.');
  } else {
    console.log('  → Live mode selected. Real messages will be sent and credits consumed.');
  }

  // Log file
  const defaultLog = existing['KWTSMS_LOG_FILE'] ?? 'kwtsms.log';
  console.log('\nAPI call logging (passwords masked; message bodies and phone numbers ARE recorded):');
  if (defaultLog) console.log(`  Current: ${defaultLog}`);
  console.log('  Type "off" to disable logging.');
  const logInput = await ask(`  Log file path [${defaultLog || 'off'}]: `);
  const logFile =
    logInput.toLowerCase() === 'off' ? '' : logInput || defaultLog;
  if (!logInput || logInput.toLowerCase() === 'off') {
    console.log(logFile ? `  → Logging to: ${logFile}` : '  → Logging disabled.');
  }

  // Write .env
  const safeUsername = username.replace(/[\r\n]/g, '');
  const safePassword = password.replace(/[\r\n]/g, '');
  const safeSenderId = senderId.replace(/[\r\n]/g, '');

  const content = [
    '# kwtSMS credentials — generated by kwtsms setup',
    `KWTSMS_USERNAME=${safeUsername}`,
    `KWTSMS_PASSWORD=${safePassword}`,
    `KWTSMS_SENDER_ID=${safeSenderId}`,
    `KWTSMS_TEST_MODE=${testMode}`,
    `KWTSMS_LOG_FILE=${logFile}`,
    '',
  ].join('\n');

  try {
    writeFileSync(envFile, content, 'utf8');
    try { chmodSync(envFile, 0o600); } catch { /* ignore on Windows */ }
    console.log(`  Tip: add "${envFile}" to your .gitignore to avoid committing credentials.`);
  } catch (e) {
    console.error(`\nError writing ${envFile}: ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`\n  Saved to ${envFile}`);
  console.log(
    testMode === '1'
      ? '  Mode: TEST — messages queued but not delivered (no credits consumed)'
      : '  Mode: LIVE — messages will be delivered and credits consumed',
  );
  console.log("  Run 'kwtsms setup' at any time to change settings.");
  console.log('─────────────────────────────────────────────────────────────────\n');
}

function printUsage(): void {
  console.log('Usage: kwtsms <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  setup                                  — interactive setup wizard');
  console.log('  verify                                 — test credentials, show balance');
  console.log('  balance                                — show available + purchased credits');
  console.log('  senderid                               — list sender IDs on this account');
  console.log('  coverage                               — list active country prefixes');
  console.log('  send <mobile> <message> [--sender ID]  — send SMS');
  console.log('  status <msg-id>                        — check delivery status');
  console.log('  validate <number> [number2 ...]        — validate phone numbers');
  console.log('');
  console.log('Examples:');
  console.log('  kwtsms send 96598765432 "Hello" --sender MY-APP');
  console.log('  kwtsms send 96598765432,96512345678 "Hello"');
  console.log('  kwtsms validate +96598765432 0096512345678');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printUsage();
    process.exit(0);
  }

  const cmd = argv[0].toLowerCase();

  if (cmd === 'setup') {
    await runSetup();
    process.exit(0);
  }

  // Load credentials
  let sms: KwtSMS;
  try {
    sms = KwtSMS.fromEnv();
  } catch {
    if (!existsSync('.env')) {
      console.log("No .env file found. Let's set up your credentials first.\n");
      await runSetup();
      try {
        sms = KwtSMS.fromEnv();
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    } else {
      console.error("Error: credentials missing or incomplete in .env");
      console.error("Run 'kwtsms setup' to fix.");
      process.exit(1);
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  if (cmd === 'verify') {
    const [ok, bal, err] = await sms.verify();
    if (ok) {
      const purchased = sms.cachedPurchased;
      console.log(`  Credentials valid  |  Available: ${bal}  |  Purchased: ${purchased}`);
      if (sms.testMode) console.log('  Mode: TEST (messages will not be delivered)');
    } else {
      console.error(`  Credential check failed: ${err}`);
      process.exit(1);
    }

  } else if (cmd === 'balance') {
    const [ok, bal, err] = await sms.verify();
    if (ok) {
      const purchased = sms.cachedPurchased;
      console.log(`  Available: ${bal}  |  Purchased: ${purchased}`);
    } else {
      console.error(`  Could not retrieve balance: ${err}`);
      process.exit(1);
    }

  } else if (cmd === 'send') {
    // Parse: kwtsms send <mobile> <message> [--sender SENDER_ID]
    const rest = argv.slice(1);
    let senderOverride: string | undefined;

    // Extract --sender flag (value may contain spaces if quoted by shell)
    const senderIdx = rest.indexOf('--sender');
    if (senderIdx >= 0) {
      const senderValue = rest[senderIdx + 1];
      if (senderValue !== undefined && !senderValue.startsWith('--')) {
        senderOverride = senderValue;
        rest.splice(senderIdx, 2);
      } else {
        console.error('Error: --sender requires a value (e.g., --sender MY-APP)');
        process.exit(1);
      }
    }

    if (rest.length < 2) {
      console.error('Usage: kwtsms send <mobile> <message> [--sender SENDER_ID]');
      console.error('       kwtsms send 96598765432,96512345678 "Hello!"');
      process.exit(1);
    }

    const [mobileArg, ...messageParts] = rest;
    const message = messageParts.join(' ');
    const numbers = mobileArg.split(',').map((n) => n.trim()).filter(Boolean);
    const mobileInput: string | string[] = numbers.length > 1 ? numbers : numbers[0];

    if (sms.testMode) process.stdout.write(TEST_MODE_WARNING);

    const result = await sms.send(mobileInput, message, senderOverride);

    if ('invalid' in result && result.invalid?.length) {
      for (const inv of result.invalid) {
        console.log(`  Skipped: ${inv.input}: ${inv.error}`);
      }
    }

    if ('bulk' in result) {
      // Bulk send result (PARTIAL or OK)
      const bulk = result as BulkSendResult;
      console.log(
        `  Sent  |  result: ${bulk.result}  |  batches: ${String(bulk.batches)}  |  numbers: ${String(bulk.numbers)}  |  balance-after: ${String(bulk['balance-after'])}`,
      );
      if (bulk['msg-ids'].length > 0) {
        console.log(`  msg-ids: ${bulk['msg-ids'].join(', ')}`);
      }
      if (bulk.errors.length > 0) {
        for (const err of bulk.errors) {
          console.error(`  Batch ${err.batch} error: ${err.code}: ${err.description}`);
        }
      }
      if (sms.testMode) {
        console.log('  (test send — check kwtsms.com Queue to confirm; delete to recover credits)');
      }
      if (bulk.result === 'ERROR') process.exit(1);
    } else if (result.result === 'OK') {
      if ('msg-id' in result) {
        console.log(
          `  Sent  |  msg-id: ${String(result['msg-id'])}  |  balance-after: ${String(result['balance-after'])}`,
        );
      }
      if (sms.testMode) {
        console.log('  (test send — check kwtsms.com Queue to confirm; delete to recover credits)');
      }
    } else {
      console.error(`  Failed: ${String(result.code ?? 'UNKNOWN')}: ${String(result.description ?? '')}`);
      if (result.action) console.error(`  Action: ${result.action}`);
      process.exit(1);
    }

  } else if (cmd === 'validate') {
    if (argv.length < 2) {
      console.error('Usage: kwtsms validate <number> [number2 ...]');
      process.exit(1);
    }
    const report = await sms.validate(argv.slice(1));
    console.log(`Valid    (OK): ${JSON.stringify(report.ok)}`);
    console.log(`Invalid  (ER): ${JSON.stringify(report.er)}`);
    console.log(`No route (NR): ${JSON.stringify(report.nr)}`);
    if (report.rejected.length > 0) {
      for (const r of report.rejected) {
        console.log(`  Rejected: ${r.input}: ${r.error}`);
      }
    }
    if (report.error) console.log(`  Error: ${report.error}`);

  } else if (cmd === 'status') {
    if (argv.length < 2) {
      console.error('Usage: kwtsms status <msg-id>');
      process.exit(1);
    }
    const result = await sms.status(argv[1]);
    if (result.result === 'OK') {
      console.log(`  msg-id: ${String(result['msg-id'] ?? argv[1])}  |  status: ${String(result['status'] ?? 'unknown')}`);
    } else {
      console.error(`  Error: ${String(result.code ?? 'UNKNOWN')}: ${String(result.description ?? '')}`);
      if (result.action) console.error(`  Action: ${result.action}`);
      process.exit(1);
    }

  } else if (cmd === 'senderid') {
    const result = await sms.senderids();
    if (result.result === 'OK' && result.senderids) {
      if (result.senderids.length > 0) {
        console.log('Sender IDs on this account:');
        for (const sid of result.senderids) console.log(`  ${sid}`);
      } else {
        console.log('No sender IDs registered on this account.');
      }
    } else {
      console.error(`  Error: ${String(result.description ?? result.code ?? 'Unknown')}`);
      if (result.action) console.error(`  Action: ${result.action}`);
      process.exit(1);
    }

  } else if (cmd === 'coverage') {
    const result = await sms.coverage();
    if (result.result === 'OK') {
      const prefixes = (result['prefixes'] as string[]) ?? [];
      console.log(`Active country prefixes (${prefixes.length}):`);
      for (const p of prefixes) console.log(`  +${p}`);
    } else {
      console.error(`  Error: ${String(result.description ?? result.code ?? 'Unknown')}`);
      if (result.action) console.error(`  Action: ${result.action}`);
      process.exit(1);
    }

  } else {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(`Unexpected error: ${(e as Error).message}`);
  process.exit(1);
});
