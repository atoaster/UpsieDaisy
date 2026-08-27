import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** txnId → bucketId */
export type Assignments = Record<string, string>;

/**
 * Durable bucket assignments, one JSON file per user under the data
 * directory. The filename is derived from a SHA-256 hash of the user's token
 * (or 'demo') — raw tokens never touch disk. Writes go via a temp file +
 * rename so a crash can't corrupt the store.
 */
export class BucketStore {
  constructor(private readonly dir: string) {}

  private fileFor(userKey: string): string {
    const h = createHash('sha256').update(userKey).digest('hex').slice(0, 32);
    return join(this.dir, `buckets-${h}.json`);
  }

  getAll(userKey: string): Assignments {
    try {
      return JSON.parse(readFileSync(this.fileFor(userKey), 'utf8')) as Assignments;
    } catch {
      return {};
    }
  }

  /** Assign a bucket, or clear the assignment when bucket is null. */
  set(userKey: string, txnId: string, bucket: string | null): Assignments {
    const all = this.getAll(userKey);
    if (bucket === null) delete all[txnId];
    else all[txnId] = bucket;
    mkdirSync(this.dir, { recursive: true });
    const file = this.fileFor(userKey);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, file);
    return all;
  }
}
