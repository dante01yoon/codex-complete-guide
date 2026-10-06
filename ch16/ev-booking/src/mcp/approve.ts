export interface ApprovalDependencies {
  projectDirectory: string;
  approvalFiles: { create(path: string): Promise<void> };
}
export async function runApprovalCommand(argv: string[], dependencies: ApprovalDependencies): Promise<void> {
  if (argv.length !== 1 || !validHoldId(argv[0])) throw new Error('Usage: npm run approve -- <holdId>');
  await dependencies.approvalFiles.create(approvalPath(dependencies.projectDirectory, argv[0]));
}

/** Human-only CLI. Importing this module never creates an approval. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    await runApprovalCommand(process.argv.slice(2), { projectDirectory, approvalFiles: {
      async create(path) {
        for (const directory of [resolve(projectDirectory, '.codex'), dirname(path)]) {
          await mkdir(directory, { recursive: true });
          const info = await lstat(directory);
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Approval directory is unsafe');
        }
        // Empty marker; never overwrite or consume an existing approval.
        await writeFile(path, '', { flag: 'wx', mode: 0o600 });
      },
    } });
    console.error('사람 승인 파일을 생성했습니다. 점유가 유효할 때 request_payment를 다시 요청하세요.');
  } catch {
    console.error('승인 파일을 생성하지 못했습니다. holdId와 프로젝트 경로, 기존 파일을 확인하세요.');
    process.exitCode = 1;
  }
}
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalPath, validHoldId } from './approval-path.js';
