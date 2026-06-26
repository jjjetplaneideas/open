/**
 * Domain models and service interfaces.
 *
 * Everything the UI needs is expressed as an interface here. The prototype ships
 * stub implementations (see ./stubs), but each interface is the exact seam where
 * a real implementation drops in:
 *   - GitHubService  -> OAuth device/PKCE flow + REST/GraphQL
 *   - AiService      -> Claude API (server-proxied; no key on device)
 *   - GitService     -> isomorphic-git / libgit2 binding / remote git
 *   - RunnerService  -> secure cloud workspace (see docs/ARCHITECTURE.md)
 *   - StorageService -> encrypted local project cache (expo-secure-store + FS)
 */

export interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
}

export interface Repo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  private: boolean;
  language: string;
  updatedAt: string;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  text: string;
  language: string;
}

/** A unified-diff-style hunk the user can accept or reject. */
export interface DiffHunk {
  id: string;
  path: string;
  before: string;
  after: string;
  summary: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Patches the assistant proposes alongside a message (never auto-applied). */
  proposedDiffs?: DiffHunk[];
  pending?: boolean;
}

export interface CommandRun {
  id: string;
  command: string;
  status: 'queued' | 'running' | 'passed' | 'failed';
  startedAt: string;
  log: string[];
}

export interface GitStatusEntry {
  path: string;
  state: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
}

// ---- Service interfaces -----------------------------------------------------

export interface GitHubService {
  /** Begin OAuth; resolves once the user has authorized the app. */
  signIn(): Promise<GitHubUser>;
  signOut(): Promise<void>;
  currentUser(): GitHubUser | null;
  listRepos(): Promise<Repo[]>;
  listBranches(repo: Repo): Promise<string[]>;
  getTree(repo: Repo, branch: string): Promise<FileNode>;
  readFile(repo: Repo, branch: string, path: string): Promise<FileContent>;
}

export interface AiService {
  /**
   * Ask the assistant. Implementations stream tokens via `onToken`. Any code
   * changes come back as `proposedDiffs` on the final message — the assistant
   * proposes patches, it never edits files silently.
   */
  ask(
    prompt: string,
    context: AiContext,
    onToken?: (chunk: string) => void
  ): Promise<ChatMessage>;
  explainFile(file: FileContent): Promise<string>;
  summarizeRepo(tree: FileNode): Promise<string>;
  generateCommitMessage(diffs: DiffHunk[]): Promise<string>;
}

export interface AiContext {
  repoFullName: string;
  openFilePath?: string;
  openFileText?: string;
  treeSummary?: string;
}

export interface RunnerService {
  /** Provision (or reuse) an isolated cloud workspace for a repo. */
  ensureWorkspace(repo: Repo, branch: string): Promise<string>;
  /** Run a user-approved command; streams logs via `onLog`. */
  run(
    workspaceId: string,
    command: string,
    onLog?: (line: string) => void
  ): Promise<CommandRun>;
  history(workspaceId: string): CommandRun[];
}

export interface GitService {
  status(): Promise<GitStatusEntry[]>;
  stage(path: string): Promise<void>;
  unstage(path: string): Promise<void>;
  commit(message: string): Promise<string>;
  push(branch: string): Promise<void>;
  pull(branch: string): Promise<void>;
  switchBranch(branch: string): Promise<void>;
}

export interface StorageService {
  /** Persist bytes for `key` in the encrypted local cache. */
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}
