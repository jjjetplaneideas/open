/**
 * Stub service implementations used by the prototype.
 *
 * They simulate latency and produce deterministic results so every screen and
 * flow is fully clickable without real credentials or network access. Replace
 * each class with a production implementation behind the same interface — no UI
 * changes required.
 */
import type {
  AiContext,
  AiService,
  ChatMessage,
  CommandRun,
  DiffHunk,
  FileContent,
  FileNode,
  GitHubService,
  GitHubUser,
  GitService,
  GitStatusEntry,
  Repo,
  RunnerService,
  StorageService,
} from './types';
import { MOCK_FILES, MOCK_REPOS, MOCK_TREE, MOCK_USER } from './mockData';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let counter = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now()}_${counter++}`;

export class StubGitHubService implements GitHubService {
  private user: GitHubUser | null = null;

  async signIn(): Promise<GitHubUser> {
    await delay(700); // simulate the OAuth round-trip
    this.user = MOCK_USER;
    return this.user;
  }
  async signOut() {
    this.user = null;
  }
  currentUser() {
    return this.user;
  }
  async listRepos(): Promise<Repo[]> {
    await delay(400);
    return MOCK_REPOS;
  }
  async listBranches(repo: Repo): Promise<string[]> {
    await delay(200);
    return [repo.defaultBranch, 'feature/touch-ui', 'fix/router-404'];
  }
  async getTree(_repo: Repo, _branch: string): Promise<FileNode> {
    await delay(300);
    return MOCK_TREE;
  }
  async readFile(_repo: Repo, _branch: string, path: string): Promise<FileContent> {
    await delay(120);
    return (
      MOCK_FILES[path] ?? { path, text: `// ${path}\n`, language: 'plaintext' }
    );
  }
}

export class StubAiService implements AiService {
  async ask(
    _prompt: string,
    context: AiContext,
    onToken?: (chunk: string) => void
  ): Promise<ChatMessage> {
    const reply =
      `Here's how I'd approach that in ${context.repoFullName}. ` +
      `Based on ${context.openFilePath ?? 'the repo'}, I propose a small patch ` +
      `you can review below before anything is applied.`;
    // Simulate token streaming.
    for (const word of reply.split(' ')) {
      await delay(18);
      onToken?.(word + ' ');
    }
    const proposedDiffs: DiffHunk[] = [];
    if (context.openFilePath && context.openFileText) {
      proposedDiffs.push(makeProposedDiff(context.openFilePath, context.openFileText));
    }
    return {
      id: uid('msg'),
      role: 'assistant',
      text: reply,
      proposedDiffs,
    };
  }

  async explainFile(file: FileContent): Promise<string> {
    await delay(500);
    return (
      `\`${file.path}\` is a ${file.language} file with ${file.text.split('\n').length} ` +
      `lines. It defines the module's public surface and is imported elsewhere in the repo.`
    );
  }

  async summarizeRepo(tree: FileNode): Promise<string> {
    await delay(500);
    const count = countFiles(tree);
    return `This repo has ~${count} tracked files. The \`src/\` directory holds the core modules and \`test/\` holds the unit tests.`;
  }

  async generateCommitMessage(diffs: DiffHunk[]): Promise<string> {
    await delay(400);
    const paths = [...new Set(diffs.map((d) => d.path))];
    return `Update ${paths.join(', ')}\n\nApply ${diffs.length} reviewed change(s) proposed by the assistant.`;
  }
}

export class StubRunnerService implements RunnerService {
  private runs: Record<string, CommandRun[]> = {};

  async ensureWorkspace(repo: Repo, branch: string): Promise<string> {
    await delay(600);
    const id = `ws_${repo.name}_${branch}`;
    this.runs[id] ??= [];
    return id;
  }

  async run(
    workspaceId: string,
    command: string,
    onLog?: (line: string) => void
  ): Promise<CommandRun> {
    const run: CommandRun = {
      id: uid('run'),
      command,
      status: 'running',
      startedAt: new Date().toISOString(),
      log: [],
    };
    (this.runs[workspaceId] ??= []).push(run);
    const lines = scriptedOutput(command);
    for (const line of lines) {
      await delay(140);
      run.log.push(line);
      onLog?.(line);
    }
    run.status = command.includes('test') && Math.random() < 0.35 ? 'failed' : 'passed';
    run.log.push(run.status === 'passed' ? '✔ done' : '✖ command failed');
    return run;
  }

  history(workspaceId: string): CommandRun[] {
    return this.runs[workspaceId] ?? [];
  }
}

export class StubGitService implements GitService {
  private entries: GitStatusEntry[] = [];
  setDirty(paths: string[]) {
    this.entries = paths.map((path) => ({ path, state: 'modified', staged: false }));
  }
  async status() {
    await delay(120);
    return this.entries;
  }
  async stage(path: string) {
    this.entries = this.entries.map((e) => (e.path === path ? { ...e, staged: true } : e));
  }
  async unstage(path: string) {
    this.entries = this.entries.map((e) => (e.path === path ? { ...e, staged: false } : e));
  }
  async commit(message: string): Promise<string> {
    await delay(300);
    this.entries = this.entries.filter((e) => !e.staged);
    return `${message.slice(0, 7)}_${uid('sha')}`;
  }
  async push(_branch: string) {
    await delay(500);
  }
  async pull(_branch: string) {
    await delay(500);
  }
  async switchBranch(_branch: string) {
    await delay(250);
  }
}

export class MemoryStorageService implements StorageService {
  private map = new Map<string, string>();
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async remove(key: string) {
    this.map.delete(key);
  }
}

// ---- helpers ----------------------------------------------------------------

function makeProposedDiff(path: string, text: string): DiffHunk {
  const after = `// NOTE: guard added by assistant\n${text}`;
  return {
    id: uid('diff'),
    path,
    before: text,
    after,
    summary: 'Add a defensive comment/guard at the top of the file.',
    status: 'pending',
  };
}

function scriptedOutput(command: string): string[] {
  if (command.includes('test')) {
    return [
      '$ ' + command,
      'PASS  test/router.test.ts',
      '  ✓ resolves a registered route (3 ms)',
      'Tests: 1 passed, 1 total',
    ];
  }
  if (command.includes('build')) {
    return ['$ ' + command, 'Compiling…', 'Build succeeded in 2.1s'];
  }
  return ['$ ' + command, '(no output)'];
}

function countFiles(node: FileNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countFiles(c), 0);
}
