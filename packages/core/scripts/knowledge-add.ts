/**
 * CLI: ingest a single knowledge document from a local file.
 *
 *   pnpm knowledge:add --client gnosis --type product_docs --file ./doc.md
 *
 * Accepts .md, .txt and .pdf (text is extracted from PDFs). The client may be
 * referenced by slug or id. Title defaults to the file name.
 */

// Load env (DATABASE_URL, REDIS_URL, ...) before @attrakt/core validates config.
import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ingestKnowledgeDocument,
  isKnowledgeSourceType,
  resolveClientId,
  prisma,
  KNOWLEDGE_SOURCE_TYPES,
} from '../src/index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm knowledge:add --client <slug|id> --type <sourceType> --file <path> [--title <title>]');
  console.error(`Source types: ${KNOWLEDGE_SOURCE_TYPES.join(', ')}`);
  console.error('Supported files: .md, .txt, .pdf');
  process.exit(1);
}

async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.txt') {
    return readFile(filePath, 'utf8');
  }
  if (ext === '.pdf') {
    const buffer = await readFile(filePath);
    // pdfjs-dist legacy build extracts text headless (no canvas / worker needed).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => ('str' in item ? item.str : '')).join(' '));
    }
    await loadingTask.destroy();
    return pages.join('\n');
  }
  fail(`Unsupported file extension "${ext}". Use .md, .txt or .pdf.`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      client: { type: 'string' },
      type: { type: 'string' },
      file: { type: 'string' },
      title: { type: 'string' },
    },
  });

  if (!values.client) fail('Missing --client');
  if (!values.type) fail('Missing --type');
  if (!values.file) fail('Missing --file');
  if (!isKnowledgeSourceType(values.type)) {
    fail(`Invalid --type "${values.type}".`);
  }

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}" (tried slug then id).`);

  const rawText = await extractText(values.file);
  const title = values.title ?? basename(values.file);

  const result = await ingestKnowledgeDocument({
    clientId,
    title,
    sourceType: values.type,
    rawText,
    metadata: { sourceFile: basename(values.file) },
  });

  const { document, deduped, truncated } = result;
  console.log('');
  console.log(deduped ? '↺ Duplicate — existing document returned' : '✓ Ingested knowledge document');
  console.log(`  id:         ${document.id}`);
  console.log(`  client:     ${values.client} (${clientId})`);
  console.log(`  title:      ${document.title}`);
  console.log(`  sourceType: ${document.sourceType}`);
  console.log(`  charCount:  ${document.charCount}${truncated ? ' (truncated)' : ''}`);
  console.log(`  contentHash:${document.contentHash}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
