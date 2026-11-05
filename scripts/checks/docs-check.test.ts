import { describe, expect, it } from 'vitest';
import { findBrokenLinks, findLongBlocks, findLongComments, findReadmeDetail, findUnlinkedDocs } from './docs-check';

const block = (length: number, prefix = '//') => Array.from({ length }, (_, index) => `${prefix} line ${index}`).join('\n');

describe('docs', () => {
  it('has no link to a file that does not exist', () => {
    expect(findBrokenLinks()).toEqual([]);
  });

  it('links every file of docs/ from the README or CLAUDE.md', () => {
    expect(findUnlinkedDocs()).toEqual([]);
  });

  it('keeps the README to links', () => {
    expect(findReadmeDetail()).toEqual([]);
  });

  it('has no comment block over the limit', () => {
    expect(findLongComments()).toEqual([]);
  });
});

describe('findLongBlocks', () => {
  it('reports a block of more than 4 lines with its first line and length', () => {
    expect(findLongBlocks(`const a = 1\n${block(5)}\nconst b = 2`, 'a.ts')).toEqual([[2, 5]]);
  });

  it('counts a JSDoc block with its opening and closing line', () => {
    expect(findLongBlocks('/**\n * a\n * b\n * c\n */', 'a.ts')).toEqual([[1, 5]]);
    expect(findLongBlocks('/**\n * a\n * b\n */', 'a.ts')).toEqual([]);
  });

  it('does not join blocks that have code between them', () => {
    expect(findLongBlocks(`${block(3)}\nconst a = 1\n${block(3)}`, 'a.ts')).toEqual([]);
  });

  it('does not count a directive, and it ends a block', () => {
    expect(findLongBlocks(`${block(3)}\n// eslint-disable-next-line x\n${block(3)}`, 'a.ts')).toEqual([]);
  });

  it('reads # comments in workflows and shell scripts only', () => {
    expect(findLongBlocks(block(5, '#'), 'a.yml')).toEqual([[1, 5]]);
    expect(findLongBlocks(block(5, '#'), 'a.ts')).toEqual([]);
  });

  it('does not count a shebang', () => {
    expect(findLongBlocks(`#!/usr/bin/env bash\n${block(4, '#')}`, 'a.sh')).toEqual([]);
  });
});
