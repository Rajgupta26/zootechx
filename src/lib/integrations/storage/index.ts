import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StoredObject } from '../types';
import { signObjectKey } from './signing';

/**
 * Object storage for invoice PDFs, proposals and client attachments.
 *
 * Local disk is the default so nothing external is needed in development.
 * S3/R2 is a signature-compatible drop-in, selected with STORAGE_PROVIDER.
 *
 * NOTE: serverless deployments have an ephemeral filesystem, so the local
 * provider must NOT be used in production on Vercel/Lambda — invoice PDFs
 * would vanish between requests.
 */

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  private resolve(key: string): string {
    // Prevent traversal out of the storage root via a crafted key.
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = path.join(STORAGE_ROOT, safe);
    if (!full.startsWith(STORAGE_ROOT)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return {
      key,
      url: `/api/files/${encodeURIComponent(key)}`,
      size: body.byteLength,
      contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async signedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expires = Date.now() + expiresInSeconds * 1000;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const sig = signObjectKey(key, expires);
    return `${base}/api/files/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}`;
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => undefined);
  }
}

/**
 * S3 / Cloudflare R2 via AWS SigV4.
 * The SDK is imported dynamically so it is only loaded when S3 is selected.
 */
class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly bucket = process.env.S3_BUCKET ?? '';

  private async client() {
    const mod = await import('@aws-sdk/client-s3');
    return {
      mod,
      s3: new mod.S3Client({
        region: process.env.S3_REGION ?? 'ap-south-1',
        endpoint: process.env.S3_ENDPOINT || undefined,
        // R2 and most S3-compatible endpoints need path-style addressing.
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
      }),
    };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const { mod, s3 } = await this.client();
    await s3.send(
      new mod.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return { key, url: await this.signedUrl(key), size: body.byteLength, contentType };
  }

  async get(key: string): Promise<Buffer> {
    const { mod, s3 } = await this.client();
    const res = await s3.send(new mod.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async signedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { mod, s3 } = await this.client();
    const presigner = await import('@aws-sdk/s3-request-presigner');
    return presigner.getSignedUrl(
      s3,
      new mod.GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }

  async delete(key: string): Promise<void> {
    const { mod, s3 } = await this.client();
    await s3.send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function getStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();
  if ((provider === 's3' || provider === 'r2') && process.env.S3_ACCESS_KEY_ID) {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

/** Deterministic key layout keeps the bucket browsable by year/month. */
export function invoicePdfKey(invoiceNumber: string, issueDate: Date): string {
  const safe = invoiceNumber.replace(/[^\w-]/g, '_');
  const y = issueDate.getFullYear();
  const m = String(issueDate.getMonth() + 1).padStart(2, '0');
  return `invoices/${y}/${m}/${safe}.pdf`;
}

