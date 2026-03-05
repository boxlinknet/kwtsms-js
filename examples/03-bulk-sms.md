# Example 03: Bulk SMS

Send to hundreds or thousands of phone numbers with automatic batching, partial failure handling, and msg-id tracking.

## Run

```bash
npx tsx examples/03-bulk-sms.ts
```

## How Bulk Sending Works

The kwtSMS API accepts a maximum of 200 numbers per request. When you pass more than 200 numbers to `sms.send()`, the library handles batching automatically:

```
500 numbers → [batch 1: 200] [batch 2: 200] [batch 3: 100]
                500ms delay    500ms delay
```

- Batches of exactly 200 (last batch may be smaller)
- 500ms delay between batches — keeps rate at 2 req/s max
- ERR013 (queue full) auto-retried with 30s/60s/120s backoff
- Returns a `BulkSendResult` with aggregate totals and per-batch errors

## Return Type: BulkSendResult

When you send to >200 numbers, `sms.send()` returns `BulkSendResult`:

```typescript
interface BulkSendResult {
  result: 'OK' | 'PARTIAL' | 'ERROR';  // overall status
  bulk: true;
  batches: number;             // total number of batches attempted
  numbers: number;             // total numbers accepted across all batches
  'points-charged': number;   // total credits consumed
  'balance-after': number | null;  // balance after last successful batch
  'msg-ids': string[];        // one msg-id per successful batch
  errors: Array<{
    batch: number;             // 1-indexed batch number
    code: string;              // error code (ERR010, NETWORK, etc.)
    description: string;
  }>;
  invalid?: InvalidEntry[];   // numbers rejected by local validation
}
```

### result values

| Value | Meaning |
|-------|---------|
| `OK` | All batches succeeded |
| `PARTIAL` | Some batches succeeded, some failed |
| `ERROR` | All batches failed |

## Sending to a Large List

```typescript
import { KwtSMS, type BulkSendResult } from 'kwtsms';

const sms = KwtSMS.fromEnv();
const numbers = ['96598765432', '96512345678', /* ... thousands more */];

const result = await sms.send(numbers, 'Hello from MYAPP!') as BulkSendResult;

console.log(result.result);             // 'OK' | 'PARTIAL' | 'ERROR'
console.log(result['msg-ids']);         // save these for DLR tracking
console.log(result['points-charged']); // total credits used
```

## Validate Before Sending

For large campaigns, validate numbers first to avoid wasting credits on invalid numbers:

```typescript
const validation = await sms.validate(numbers);

// Filter to only routable numbers
const sendable = validation.ok;
console.log(`${sendable.length} numbers ready to send`);
console.log(`${validation.er.length} have format errors — fix before sending`);
console.log(`${validation.nr.length} have no route — contact kwtSMS support`);

// Send only valid numbers
const result = await sms.send(sendable, 'Hello from MYAPP!');
```

## Save msg-ids

Always save the `msg-ids` from a successful send to your database. These are needed to check delivery status or request delivery reports later:

```typescript
// After sending
const result = await sms.send(numbers, message) as BulkSendResult;

if (result.result !== 'ERROR') {
  // Save each msg-id with metadata
  for (let i = 0; i < result['msg-ids'].length; i++) {
    await db.campaigns.create({
      msgId: result['msg-ids'][i],
      batchNumber: i + 1,
      sentAt: new Date(),
      creditsCharged: result['points-charged'],
    });
  }
}
```

## Handling Partial Failures

```typescript
if (result.result === 'PARTIAL') {
  // Some batches failed — log for retry
  for (const { batch, code, description } of result.errors) {
    console.error(`Batch ${batch} failed: [${code}] ${description}`);
    // You have result['msg-ids'] for the successful batches already
    // Re-send batch ${batch} from the original number list later
  }
}
```

## Balance Estimation Before Sending

Check you have enough credits before a large send:

```typescript
const balance = await sms.balance();
const estimatedCredits = numbers.length * 1; // 1 credit per SMS (1 page, English)
// Arabic/Unicode messages: 1 credit per page, pages are 70 chars each

if (balance === null || balance < estimatedCredits) {
  throw new Error(`Insufficient balance: have ${balance}, need ~${estimatedCredits}`);
}
```

## Error Codes in Bulk Context

| Code | Meaning in bulk | Action |
|------|-----------------|--------|
| `ERR010` | Zero balance at batch N | Top up; msg-ids before this batch are valid |
| `ERR011` | Insufficient balance at batch N | Same as above |
| `ERR013` | Queue full | Auto-retried with backoff; persistent failure means try later |
| `NETWORK` | Connectivity error at batch N | Check internet; retry that batch |

## Rate Limiting

The kwtSMS API allows a maximum of 5 requests/second and recommends a maximum of 2/second. The library enforces 500ms between batches automatically. For very large sends (10,000+ numbers), the total send time will be:

```
50 batches × 0.5s delay = ~25 seconds minimum
```

Plan accordingly and don't set server timeouts shorter than the expected duration.
