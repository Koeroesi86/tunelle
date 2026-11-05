import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { defaultLanguage, loadLanguages, loadTemplates, pagePath, relativeLink, renderPage, renderPages } from './site-pages';

const languages: Record<string, Record<string, string>> = loadLanguages();
const templates: Record<string, string> = loadTemplates();
const site = resolve(__dirname, '../..', 'site');
const placeholdersOf = (message: string) => [...message.matchAll(/\{\{(?:version|notes)\}\}|\{system\}/g)].map(([found]) => found).sort();
const english = languages[defaultLanguage];

describe('the strings of the website', () => {
  it('has English and Hungarian', () => {
    expect(Object.keys(languages)).toEqual(expect.arrayContaining(['en', 'hu']));
  });

  it.each(Object.entries(languages))('%s has every key of English and no other', (_tag, strings) => {
    expect(Object.keys(strings).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(Object.entries(languages))('%s keeps the placeholders of English and has no empty text', (_tag, strings) => {
    expect(Object.entries(strings).filter(([key, text]) => text.trim() === '' || placeholdersOf(text).join() !== placeholdersOf(english[key]).join())).toEqual(
      []
    );
  });

  it('uses every English key in a template', () => {
    const used = Object.values(templates).flatMap((template) => [...template.matchAll(/\{\{t:([\w.]+)\}\}/g)].map(([, key]) => key));

    expect(Object.keys(english).filter((key) => !key.startsWith('meta.languag') && !used.includes(key))).toEqual([]);
  });
});

describe('renderPages', () => {
  const pages = renderPages();

  it('keeps the English pages on their old addresses and puts the others in a folder', () => {
    expect(pages.map(([path]) => path).sort()).toEqual(['hu/index.html', 'hu/privacy.html', 'index.html', 'privacy.html']);
  });

  it('fills every placeholder but the ones of the release', () => {
    expect(
      pages
        .flatMap(([path, html]) => [...html.matchAll(/\{\{[^}]+\}\}/g)].map(([found]) => `${path} ${found}`))
        .filter((found) => !/\{\{version\}\}|\{\{notes\}\}|\{\{asset:/.test(found))
    ).toEqual([]);
  });

  it.each(pages)('%s has its language and points its hreflang links at pages that exist', (path, html) => {
    const tag = path.startsWith('hu/') ? 'hu' : 'en';
    const hrefs = [...html.matchAll(/hreflang="([\w-]+)" href="https:\/\/koeroesi86\.github\.io\/tunelle\/([^"]*)"/g)];

    expect(html).toContain(`<html lang="${tag}">`);
    expect(hrefs.map(([, language]) => language).sort()).toEqual(['en', 'hu', 'x-default']);
    hrefs.forEach(([, , target]) => expect(pages.map(([other]) => other)).toContain(target.endsWith('/') || target === '' ? `${target}index.html` : target));
  });

  it.each(pages)('%s links the page of the other language back, and a file that exists', (path, html) => {
    const links = [...html.matchAll(/<a href="([^"]*)" hreflang="(\w+)" lang="\w+">/g)];
    const folder = path.includes('/') ? 'hu' : '';

    expect(links).toHaveLength(1);
    links.forEach(([, href]) => {
      const target = join(folder, href.endsWith('/') || href === '' ? `${href}index.html` : href);
      expect(pages.map(([other]) => other)).toContain(target);
    });
  });

  it('points the assets of a folder at the site root', () => {
    expect(pages.find(([path]) => path === 'hu/index.html')?.[1]).toContain('href="../style.css"');
    expect(pages.find(([path]) => path === 'index.html')?.[1]).toContain('href="style.css"');
  });

  it('only references files that the site has', () => {
    const files = pages.flatMap(([path, html]) =>
      [...html.matchAll(/(?:src|href)="((?:\.\.\/)?(?:[\w-]+\/)?[\w-]+\.(?:css|js|svg|webp|png))"/g)].map(([, file]) => [path, file])
    );

    expect(files.filter(([, file]) => !existsSync(join(site, file.replace(/^\.\.\//, '')))).map(([path, file]) => `${path} ${file}`)).toEqual([]);
  });
});

describe('renderPage', () => {
  it('fails on a key the language lacks', () => {
    expect(() => renderPage('{{t:missing.key}}', { languages: { en: {} }, tag: 'en', name: 'index' })).toThrow('missing.key');
  });
});

describe('relativeLink', () => {
  it.each([
    ['en', 'hu', 'index', 'hu/'],
    ['en', 'hu', 'privacy', 'hu/privacy.html'],
    ['hu', 'en', 'index', '../'],
    ['hu', 'en', 'privacy', '../privacy.html'],
  ])('from %s to %s %s is %s', (from, to, name, expected) => {
    expect(relativeLink(from, to, name)).toBe(expected);
  });

  it('writes the English page at the root', () => {
    expect(pagePath('en', 'privacy')).toBe('privacy.html');
  });
});
