import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hooks = __dirname;
const hasTools = process.platform !== 'win32' && ['bash', 'jq'].every((tool) => spawnSync(tool, ['--version']).status === 0);
let project: string;

const run = (hook: string, toolInput: object, env: Record<string, string> = {}) => {
  const { status, stderr } = spawnSync('bash', [join(hooks, hook)], {
    input: JSON.stringify({ tool_input: toolInput }),
    encoding: 'utf8',
    cwd: project,
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
  });
  return { status, stderr };
};

describe.skipIf(!hasTools)('claude hooks', () => {
  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'tunelle-hooks-'));
    mkdirSync(join(project, 'electron/database'), { recursive: true });
    mkdirSync(join(project, 'migrations'));
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'x', version: '26.10.1' }));
    writeFileSync(join(project, 'electron/database/migrations-checksums.json'), JSON.stringify({ '001-shipped.sql': 'abc' }));
  });

  afterAll(() => rmSync(project, { recursive: true, force: true }));

  describe('guard-bash', () => {
    it.each([
      'git commit --no-verify -m x',
      'npx prettier --write src',
      'npx prettier -w src',
      "sed -i 's/jobs:/continue-on-error: true/' .github/workflows/test.yml",
      'git mv .github/workflows/release.yml .github/workflows/publish.yml',
      'git push origin HEAD:master',
    ])('blocks %s', (command) => {
      expect(run('guard-bash.sh', { command }).status).toBe(2);
    });

    it('allows a commit message that names what it forbids', () => {
      const command = 'git commit -m "Block continue-on-error and prettier --write\n\nnot --no-verify"';

      expect(run('guard-bash.sh', { command }).status).toBe(0);
    });

    it.each(['npm run lint:fix', 'git push -u origin fix-thing', 'grep -rn continue-on-error .github', 'git log --grep=no-verify'])('allows %s', (command) => {
      expect(run('guard-bash.sh', { command }).status).toBe(0);
    });
  });

  describe('guard-edit', () => {
    const file = (name: string) => join(project, name);

    it('blocks an edit of the version in package.json', () => {
      const input = { file_path: file('package.json'), old_string: '"version": "26.10.1"', new_string: '"version": "26.10.2"' };

      expect(run('guard-edit.sh', input).status).toBe(2);
    });

    it('blocks a rewrite of package.json that changes the version', () => {
      const input = { file_path: file('package.json'), content: JSON.stringify({ name: 'x', version: '1.0.0' }) };

      expect(run('guard-edit.sh', input).status).toBe(2);
    });

    it('allows a rewrite of package.json that keeps the version', () => {
      const input = { file_path: file('package.json'), content: JSON.stringify({ name: 'y', version: '26.10.1' }) };

      expect(run('guard-edit.sh', input).status).toBe(0);
    });

    it('allows other edits of package.json', () => {
      const input = { file_path: file('package.json'), old_string: '"lint"', new_string: '"lint:all"' };

      expect(run('guard-edit.sh', input).status).toBe(0);
    });

    it('blocks an edit of a migration that has shipped and allows a new one', () => {
      expect(run('guard-edit.sh', { file_path: file('migrations/001-shipped.sql'), new_string: 'x' }).status).toBe(2);
      expect(run('guard-edit.sh', { file_path: file('migrations/002-new.sql'), content: 'x' }).status).toBe(0);
    });
  });

  describe('guard-comments', () => {
    const repository = resolve(__dirname, '../..');
    const long = Array.from({ length: 5 }, (_, index) => `// line ${index}`).join('\n');
    const edit = (file: string, text: string) =>
      run('guard-comments.sh', { file_path: join(repository, file), new_string: text }, { CLAUDE_PROJECT_DIR: repository });

    it('blocks a comment of more than 4 lines in the code and says where it goes', () => {
      const { status, stderr } = edit('electron/main.ts', `const a = 1\n${long}\nconst b = 2`);

      expect(status).toBe(2);
      expect(stderr).toMatch(/docs\//);
    });

    it.each(['electron/main.test.ts', 'migrations/004-x.sql', 'docs/install.md'])('allows it in %s', (file) => {
      expect(edit(file, long).status).toBe(0);
    });

    it('allows a comment of 4 lines and lines of code between comments', () => {
      expect(edit('scripts/x.js', '// a\n// b\n// c\n// d\nconst a = 1\n// e\n// f').status).toBe(0);
    });
  });

  describe('guard-output', () => {
    const big = () => {
      writeFileSync(join(project, 'big.txt'), 'x\n'.repeat(400));
      writeFileSync(join(project, 'small.txt'), 'x\n');
    };

    it.each(['cat a.ts b.ts', 'cd x && cat a.ts b.ts | head', 'cat src/*.ts', 'cat big.txt', 'gh run view 1 --log', 'gh pr diff 3', 'npm ci'])(
      'blocks %s',
      (command) => {
        big();

        expect(run('guard-output.sh', { command }).status).toBe(2);
      }
    );

    it.each([
      'cat small.txt',
      'cat big.txt | head -50',
      'cat > out.txt',
      "cat <<'EOF'\ncat a b\nEOF",
      'git commit -m "cat a b"',
      'gh run view 1 --log-failed | tail -n 100',
      'gh pr diff 3 > diff.txt',
      'gh run view 1',
      'npm ci 2>&1 | tail -5',
      'grep -n x a.ts b.ts',
    ])('allows %s', (command) => {
      big();

      expect(run('guard-output.sh', { command }).status).toBe(0);
    });
  });

  describe('context-nudge', () => {
    const nudge = (tokens: number, session: string) => {
      const transcript = join(project, `${session}.jsonl`);
      writeFileSync(
        transcript,
        `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: tokens } } })}\n`
      );
      const { status, stdout } = spawnSync('bash', [join(hooks, 'context-nudge.sh')], {
        input: JSON.stringify({ transcript_path: transcript, session_id: session }),
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: project },
      });
      return { status, stdout };
    };

    it('stays quiet below 150K', () => {
      expect(nudge(100000, 'quiet').stdout).toBe('');
    });

    it('says it once per level', () => {
      expect(nudge(160000, 'levels').stdout).toContain('/handoff');
      expect(nudge(170000, 'levels').stdout).toBe('');
      expect(nudge(260000, 'levels').stdout).toContain('261K');
      expect(nudge(270000, 'levels').stdout).toBe('');
    });
  });

  describe('repeat-failure', () => {
    const fail = (command: string) =>
      spawnSync('bash', [join(hooks, 'repeat-failure.sh')], {
        input: JSON.stringify({ session_id: 'failing', tool_input: { command } }),
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: project },
      }).stdout;

    it('speaks on the third failure of the same command and not after another one', () => {
      expect([fail('npm test'), fail('npm test')]).toEqual(['', '']);
      expect(fail('npm test')).toContain('3 times');
      expect(fail('npm run lint')).toBe('');
    });
  });

  describe('no-ascii-preview', () => {
    it('blocks a question with a preview and allows one without', () => {
      const question = (option: Record<string, string>) => ({
        questions: [{ question: 'Which?', header: 'Layout', multiSelect: false, options: [option, { label: 'B', description: 'b' }] }],
      });

      expect(run('no-ascii-preview.sh', question({ label: 'A', description: 'a', preview: '+--+' })).status).toBe(2);
      expect(run('no-ascii-preview.sh', question({ label: 'A', description: 'a' })).status).toBe(0);
    });
  });

  describe('push-gate', () => {
    it.each(['npm run build', 'git status', 'git log push.txt', 'gh pr view 3'])('ignores %s', (command) => {
      expect(run('push-gate.sh', { command }).status).toBe(0);
    });
  });

  describe('session-node', () => {
    it('does nothing without an environment file', () => {
      expect(run('session-node.sh', {}, { CLAUDE_ENV_FILE: '' }).status).toBe(0);
    });
  });
});
