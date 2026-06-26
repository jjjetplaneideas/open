/**
 * Single source of truth for the prototype.
 *
 * Holds auth/repo/editor/chat/runner/git state and exposes intent-style actions
 * the screens call. Services are injected (stubs today, real implementations
 * later) so the UI never talks to the network directly.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  StubAiService,
  StubGitHubService,
  StubGitService,
  StubRunnerService,
  MemoryStorageService,
  uid,
} from '../services/stubs';
import type {
  ChatMessage,
  CommandRun,
  DiffHunk,
  FileContent,
  FileNode,
  GitHubUser,
  GitStatusEntry,
  Repo,
} from '../services/types';

export type ScreenKey =
  | 'dashboard'
  | 'explorer'
  | 'editor'
  | 'assistant'
  | 'diff'
  | 'terminal'
  | 'commit'
  | 'settings';

interface AppContextValue {
  // session
  user: GitHubUser | null;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;

  // repo
  repos: Repo[];
  repo: Repo | null;
  branch: string;
  branches: string[];
  tree: FileNode | null;
  openRepo: (repo: Repo) => Promise<void>;
  switchBranch: (branch: string) => Promise<void>;

  // editor
  openFile: FileContent | null;
  openFilePath: string | null;
  selectFile: (path: string) => Promise<void>;
  editFile: (text: string) => void;
  dirtyPaths: string[];

  // chat
  messages: ChatMessage[];
  sendToAssistant: (prompt: string) => Promise<void>;
  assistantBusy: boolean;

  // diffs
  pendingDiffs: DiffHunk[];
  resolveDiff: (id: string, status: 'accepted' | 'rejected') => void;

  // runner
  runs: CommandRun[];
  runCommand: (command: string) => Promise<void>;
  runnerBusy: boolean;

  // git
  gitStatus: GitStatusEntry[];
  refreshGit: () => Promise<void>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  commitAndPush: (message: string) => Promise<void>;

  // navigation
  screen: ScreenKey;
  navigate: (s: ScreenKey) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const services = useRef({
    github: new StubGitHubService(),
    ai: new StubAiService(),
    runner: new StubRunnerService(),
    git: new StubGitService(),
    storage: new MemoryStorageService(),
  }).current;

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [tree, setTree] = useState<FileNode | null>(null);

  const [openFile, setOpenFile] = useState<FileContent | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<DiffHunk[]>([]);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CommandRun[]>([]);
  const [runnerBusy, setRunnerBusy] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusEntry[]>([]);
  const [screen, setScreen] = useState<ScreenKey>('explorer');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const dirtyPaths = useMemo(() => Object.keys(dirty), [dirty]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      const u = await services.github.signIn();
      setUser(u);
      setRepos(await services.github.listRepos());
    } finally {
      setSigningIn(false);
    }
  }, [services]);

  const signOut = useCallback(() => {
    services.github.signOut();
    setUser(null);
    setRepo(null);
    setRepos([]);
    setTree(null);
    setOpenFile(null);
    setMessages([]);
  }, [services]);

  const openRepo = useCallback(
    async (r: Repo) => {
      setRepo(r);
      setBranch(r.defaultBranch);
      const [b, t, ws] = await Promise.all([
        services.github.listBranches(r),
        services.github.getTree(r, r.defaultBranch),
        services.runner.ensureWorkspace(r, r.defaultBranch),
      ]);
      setBranches(b);
      setTree(t);
      setWorkspaceId(ws);
      setScreen('dashboard');
    },
    [services]
  );

  const switchBranch = useCallback(
    async (b: string) => {
      if (!repo) return;
      await services.git.switchBranch(b);
      setBranch(b);
      setTree(await services.github.getTree(repo, b));
    },
    [repo, services]
  );

  const selectFile = useCallback(
    async (path: string) => {
      if (!repo) return;
      const content = dirty[path]
        ? { path, text: dirty[path], language: guessLang(path) }
        : await services.github.readFile(repo, branch, path);
      setOpenFile(content);
      setScreen('editor');
    },
    [repo, branch, dirty, services]
  );

  const editFile = useCallback((text: string) => {
    setOpenFile((prev) => {
      if (!prev) return prev;
      setDirty((d) => ({ ...d, [prev.path]: text }));
      return { ...prev, text };
    });
  }, []);

  const sendToAssistant = useCallback(
    async (prompt: string) => {
      if (!repo) return;
      const userMsg: ChatMessage = { id: uid('msg'), role: 'user', text: prompt };
      const placeholder: ChatMessage = {
        id: uid('msg'),
        role: 'assistant',
        text: '',
        pending: true,
      };
      setMessages((m) => [...m, userMsg, placeholder]);
      setAssistantBusy(true);
      try {
        const result = await services.ai.ask(
          prompt,
          {
            repoFullName: repo.fullName,
            openFilePath: openFile?.path,
            openFileText: openFile?.text,
          },
          (chunk) =>
            setMessages((m) =>
              m.map((msg) =>
                msg.id === placeholder.id ? { ...msg, text: msg.text + chunk } : msg
              )
            )
        );
        setMessages((m) => m.map((msg) => (msg.id === placeholder.id ? result : msg)));
        if (result.proposedDiffs?.length) {
          setPendingDiffs((d) => [...d, ...result.proposedDiffs!]);
        }
      } finally {
        setAssistantBusy(false);
      }
    },
    [repo, openFile, services]
  );

  const resolveDiff = useCallback(
    (id: string, status: 'accepted' | 'rejected') => {
      setPendingDiffs((diffs) => {
        const target = diffs.find((d) => d.id === id);
        if (target && status === 'accepted') {
          setDirty((d) => ({ ...d, [target.path]: target.after }));
          setOpenFile((prev) =>
            prev && prev.path === target.path ? { ...prev, text: target.after } : prev
          );
        }
        return diffs.map((d) => (d.id === id ? { ...d, status } : d));
      });
    },
    []
  );

  const runCommand = useCallback(
    async (command: string) => {
      if (!repo) return;
      const ws = workspaceId ?? (await services.runner.ensureWorkspace(repo, branch));
      setWorkspaceId(ws);
      setRunnerBusy(true);
      const live: CommandRun = {
        id: uid('run'),
        command,
        status: 'running',
        startedAt: new Date().toISOString(),
        log: [],
      };
      setRuns((r) => [...r, live]);
      try {
        const finished = await services.runner.run(ws, command, (line) =>
          setRuns((r) =>
            r.map((run) => (run.id === live.id ? { ...run, log: [...run.log, line] } : run))
          )
        );
        setRuns((r) => r.map((run) => (run.id === live.id ? finished : run)));
      } finally {
        setRunnerBusy(false);
      }
    },
    [repo, branch, workspaceId, services]
  );

  const refreshGit = useCallback(async () => {
    services.git.setDirty(dirtyPaths);
    setGitStatus(await services.git.status());
  }, [services, dirtyPaths]);

  const stage = useCallback(
    async (path: string) => {
      await services.git.stage(path);
      setGitStatus(await services.git.status());
    },
    [services]
  );

  const unstage = useCallback(
    async (path: string) => {
      await services.git.unstage(path);
      setGitStatus(await services.git.status());
    },
    [services]
  );

  const commitAndPush = useCallback(
    async (message: string) => {
      await services.git.commit(message);
      await services.git.push(branch);
      setDirty({});
      setGitStatus([]);
      setPendingDiffs((d) => d.filter((x) => x.status === 'pending'));
      setScreen('explorer');
    },
    [services, branch]
  );

  const value: AppContextValue = {
    user,
    signingIn,
    signIn,
    signOut,
    repos,
    repo,
    branch,
    branches,
    tree,
    openRepo,
    switchBranch,
    openFile,
    openFilePath: openFile?.path ?? null,
    selectFile,
    editFile,
    dirtyPaths,
    messages,
    sendToAssistant,
    assistantBusy,
    pendingDiffs,
    resolveDiff,
    runs,
    runCommand,
    runnerBusy,
    gitStatus,
    refreshGit,
    stage,
    unstage,
    commitAndPush,
    screen,
    navigate: setScreen,
    commandPaletteOpen,
    setCommandPaletteOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

function guessLang(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.rs')) return 'rust';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.json')) return 'json';
  return 'plaintext';
}
