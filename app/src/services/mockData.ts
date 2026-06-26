import type { FileContent, FileNode, Repo, GitHubUser } from './types';

export const MOCK_USER: GitHubUser = {
  login: 'octodev',
  name: 'Octo Dev',
  avatarUrl: '',
};

export const MOCK_REPOS: Repo[] = [
  {
    id: '1',
    owner: 'octodev',
    name: 'pocket-server',
    fullName: 'octodev/pocket-server',
    description: 'A tiny HTTP server with a pluggable router.',
    defaultBranch: 'main',
    private: false,
    language: 'TypeScript',
    updatedAt: '2026-06-20T10:00:00Z',
  },
  {
    id: '2',
    owner: 'octodev',
    name: 'rope-notes',
    fullName: 'octodev/rope-notes',
    description: 'Markdown notes app backed by a rope buffer.',
    defaultBranch: 'main',
    private: true,
    language: 'Rust',
    updatedAt: '2026-06-18T14:30:00Z',
  },
  {
    id: '3',
    owner: 'octodev',
    name: 'glyph-ui',
    fullName: 'octodev/glyph-ui',
    description: 'Touch-first component kit.',
    defaultBranch: 'develop',
    private: false,
    language: 'TypeScript',
    updatedAt: '2026-06-10T09:15:00Z',
  },
];

export const MOCK_TREE: FileNode = {
  path: '',
  name: 'pocket-server',
  type: 'dir',
  children: [
    {
      path: 'src',
      name: 'src',
      type: 'dir',
      children: [
        { path: 'src/index.ts', name: 'index.ts', type: 'file' },
        { path: 'src/router.ts', name: 'router.ts', type: 'file' },
        { path: 'src/server.ts', name: 'server.ts', type: 'file' },
      ],
    },
    {
      path: 'test',
      name: 'test',
      type: 'dir',
      children: [{ path: 'test/router.test.ts', name: 'router.test.ts', type: 'file' }],
    },
    { path: 'README.md', name: 'README.md', type: 'file' },
    { path: 'package.json', name: 'package.json', type: 'file' },
  ],
};

export const MOCK_FILES: Record<string, FileContent> = {
  'src/index.ts': {
    path: 'src/index.ts',
    language: 'typescript',
    text: `import { createServer } from './server';
import { Router } from './router';

// Entry point: wire up routes and start listening.
const router = new Router();

router.get('/health', (_req, res) => {
  res.end('ok');
});

const server = createServer(router);
const PORT = Number(process.env.PORT ?? 3000);

server.listen(PORT, () => {
  console.log(\`listening on :\${PORT}\`);
});
`,
  },
  'src/router.ts': {
    path: 'src/router.ts',
    language: 'typescript',
    text: `type Handler = (req: Request, res: Response) => void;

export class Router {
  private routes = new Map<string, Handler>();

  get(path: string, handler: Handler) {
    this.routes.set('GET ' + path, handler);
  }

  resolve(method: string, path: string): Handler | undefined {
    return this.routes.get(method + ' ' + path);
  }
}
`,
  },
  'src/server.ts': {
    path: 'src/server.ts',
    language: 'typescript',
    text: `import http from 'node:http';
import { Router } from './router';

export function createServer(router: Router) {
  return http.createServer((req, res) => {
    const handler = router.resolve(req.method ?? 'GET', req.url ?? '/');
    if (!handler) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    handler(req as never, res as never);
  });
}
`,
  },
  'test/router.test.ts': {
    path: 'test/router.test.ts',
    language: 'typescript',
    text: `import { Router } from '../src/router';

test('resolves a registered route', () => {
  const r = new Router();
  r.get('/health', () => {});
  expect(r.resolve('GET', '/health')).toBeDefined();
});
`,
  },
  'README.md': {
    path: 'README.md',
    language: 'markdown',
    text: `# pocket-server

A tiny HTTP server with a pluggable router.

## Usage

\`\`\`
npm install
npm start
\`\`\`
`,
  },
  'package.json': {
    path: 'package.json',
    language: 'json',
    text: `{
  "name": "pocket-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node dist/index.js",
    "test": "jest"
  }
}
`,
  },
};
