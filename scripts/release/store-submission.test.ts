import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublished, assertSubmittable, decide, readStatus, readStoreVersion, releaseVersion, run, withReleaseNotes } from './store-submission';

const submission = (...versions: string[]) =>
  `Retrieving Submission\n${JSON.stringify({ Id: '1', ApplicationPackages: versions.map((Version) => ({ FileName: 'Tunelle.appx', Version })) }, undefined, 2)}\n`;

describe('releaseVersion', () => {
  it('keeps the first three parts', () => {
    expect(releaseVersion('26.10.14.0')).toBe('26.10.14');
    expect(releaseVersion('26.10.14')).toBe('26.10.14');
  });
});

describe('readStatus', () => {
  it('reads the status after the progress display', () => {
    expect(readStatus('Retrieving submission status\nSubmission Status = Certification\n')).toBe('Certification');
  });

  it('reads it through the colours msstore adds', () => {
    expect(readStatus('Retrieving Last Published Submission\nSubmission Status = \u001b[38;5;2mPublished\u001b[0m\n')).toBe('Published');
  });

  it('has none in other output', () => {
    expect(readStatus('Error!')).toBeUndefined();
  });
});

describe('assertPublished', () => {
  it('accepts a published submission', () => {
    expect(() => assertPublished('Submission Status = Published')).not.toThrow();
  });

  it.each(['Certification', 'PendingCommit', 'CertificationFailed', 'Publishing'])('stops while the last submission is %s', (status) => {
    expect(() => assertPublished(`Submission Status = ${status}`)).toThrow(status);
  });

  it('stops when the status is not known, instead of submitting', () => {
    expect(() => assertPublished('Error!')).toThrow('not known');
  });
});

describe('readStoreVersion', () => {
  it('takes the greatest version of the packages, without the fourth part', () => {
    expect(readStoreVersion(submission('26.10.9.0', '26.10.14.0', '26.10.14.0'))).toBe('26.10.14');
  });

  it('reads the keys in camel case too', () => {
    expect(readStoreVersion(JSON.stringify({ applicationPackages: [{ version: '26.11.15.0' }] }))).toBe('26.11.15');
  });

  it('reads the JSON through colours around it', () => {
    expect(readStoreVersion(`\u001b[38;5;2mLast Published Submission\u001b[0m\n${submission('26.11.18.0')}`)).toBe('26.11.18');
  });

  it('orders the versions as numbers', () => {
    expect(readStoreVersion(submission('26.10.9.0', '26.10.14.0'))).toBe('26.10.14');
  });

  it('fails without a package, instead of letting any version through', () => {
    expect(() => readStoreVersion(submission())).toThrow('not known');
  });

  it('fails on output without JSON', () => {
    expect(() => readStoreVersion('Error!')).toThrow();
  });
});

describe('assertSubmittable', () => {
  const packages = ['26.10.15.0', '26.10.15.0'];

  it('accepts a greater version with the fourth part 0', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', packages)).not.toThrow();
  });

  it.each(['26.10.15', '26.10.14'])('refuses a version that is not greater than %s', (storeVersion) => {
    expect(() => assertSubmittable('v26.10.14', storeVersion, ['26.10.14.0'])).toThrow('not greater');
  });

  it('refuses a fourth part that is not 0', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', ['26.10.15.0', '26.10.15.1'])).toThrow('26.10.15.1');
  });

  it('refuses a package of another version than the tag', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', ['26.10.14.0'])).toThrow('26.10.14.0');
  });

  it.each(['26.10.15', 'v26.10', 'v26.010.15', 'v26.10.15-beta'])('refuses %s as a tag', (tag) => {
    expect(() => assertSubmittable(tag, '26.10.14', packages)).toThrow('release tag');
  });

  it('refuses without a package version', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', [])).toThrow('No package version');
  });
});

describe('withReleaseNotes', () => {
  const listing = (ReleaseNotes: string) => ({ BaseListing: { Description: 'A player', ReleaseNotes }, Platform: 'Windows10' });
  const output = (Listings: Record<string, object>) =>
    `Retrieving Submission\n${JSON.stringify({ Id: '1', Pricing: { PriceId: 'Free' }, Listings }, undefined, 2)}\n`;

  it('sets the notes in every listing and keeps the rest of the submission', () => {
    const result = JSON.parse(
      withReleaseNotes(output({ 'en-us': listing('First release in the Microsoft Store'), 'hu-hu': listing('') }), 'Bug fixes and improvements.')
    );

    expect(result.Listings['en-us'].BaseListing).toEqual({ Description: 'A player', ReleaseNotes: 'Bug fixes and improvements.' });
    expect(result.Listings['hu-hu'].BaseListing.ReleaseNotes).toBe('Bug fixes and improvements.');
    expect(result.Listings['en-us'].Platform).toBe('Windows10');
    expect(result.Pricing).toEqual({ PriceId: 'Free' });
    expect(result.Id).toBe('1');
  });

  it('sets the notes of the language of a listing, whatever its region, and the others to the notes given', () => {
    const result = JSON.parse(
      withReleaseNotes(output({ 'en-us': listing('x'), 'hu-hu': listing('y'), 'de-de': listing('z') }), 'Fixes.', { hu: 'Javítások.' })
    );

    expect(result.Listings['hu-hu'].BaseListing.ReleaseNotes).toBe('Javítások.');
    expect(result.Listings['en-us'].BaseListing.ReleaseNotes).toBe('Fixes.');
    expect(result.Listings['de-de'].BaseListing.ReleaseNotes).toBe('Fixes.');
  });

  it('reads the submission through colours around it', () => {
    const result = JSON.parse(withReleaseNotes(`\u001b[38;5;2mPending Submission\u001b[0m\n${output({ 'en-us': listing('') })}`, 'Notes'));

    expect(result.Listings['en-us'].BaseListing.ReleaseNotes).toBe('Notes');
  });

  it('marks the packages of the earlier submission for deletion and keeps the one pending upload', () => {
    const packages = [
      { FileName: 'Tunelle-26.11.15-x64.appx', FileStatus: 'Uploaded', Version: '26.11.15.0' },
      { FileName: 'Tunelle-26.11.15-arm64.appx', FileStatus: 'Uploaded', Version: '26.11.15.0' },
      { FileName: 'Tunelle-26.11.18.msixbundle', FileStatus: 'PendingUpload', Version: null },
    ];
    const result = JSON.parse(withReleaseNotes(`${JSON.stringify({ ApplicationPackages: packages, Listings: { 'en-us': listing('') } })}`, 'Notes'));

    expect(result.ApplicationPackages.map(({ FileName, FileStatus }: { FileName: string; FileStatus: string }) => [FileName, FileStatus])).toEqual([
      ['Tunelle-26.11.15-x64.appx', 'PendingDelete'],
      ['Tunelle-26.11.15-arm64.appx', 'PendingDelete'],
      ['Tunelle-26.11.18.msixbundle', 'PendingUpload'],
    ]);
    expect(result.ApplicationPackages[0].Version).toBe('26.11.15.0');
  });

  it('fails without a listing, instead of sending a submission with no notes', () => {
    expect(() => withReleaseNotes(output({}), 'Notes')).toThrow('no listing');
  });

  it('fails without notes, instead of emptying them', () => {
    expect(() => withReleaseNotes(output({ 'en-us': listing('x') }), '')).toThrow('No release notes');
  });
});

describe('decide', () => {
  const status = (value: string) => `Submission Status = ${value}\n`;

  it('submits a greater version after a published submission', () => {
    expect(decide(status('Published'), submission('26.11.15.0'), 'v26.11.18', true)).toEqual({
      submit: true,
      reason: '26.11.18 is greater than 26.11.15 of the last submission',
    });
  });

  it.each(['Certification', 'Publishing', 'PreProcessing'])('waits for a submission that is %s in an automatic run', (value) => {
    const { submit, reason } = decide(status(value), submission('26.11.18.0'), 'v26.11.19', true);

    expect(submit).toBe(false);
    expect(reason).toContain(value);
  });

  it('stops a manual run for a submission in progress', () => {
    expect(() => decide(status('Certification'), submission('26.11.18.0'), 'v26.11.19', false)).toThrow('Certification');
  });

  it.each(['PendingCommit', 'CertificationFailed', 'CommitFailed', 'PublishFailed'])(
    'stops an automatic run for a submission that needs somebody: %s',
    (value) => {
      expect(() => decide(status(value), submission('26.11.15.0'), 'v26.11.18', true)).toThrow(value);
    }
  );

  it('skips a release that is not greater than the one in the Store in an automatic run', () => {
    expect(decide(status('Published'), submission('26.11.18.0'), 'v26.11.18', true).submit).toBe(false);
    expect(decide(status('Published'), submission('26.11.18.0'), 'v26.11.17', true).submit).toBe(false);
  });

  it('leaves a version that is not greater to the check of a manual run, which says why', () => {
    expect(decide(status('Published'), submission('26.11.18.0'), 'v26.11.18', false).submit).toBe(true);
  });

  it('stops when the state is not known, instead of submitting', () => {
    expect(() => decide('Error!', submission('26.11.15.0'), 'v26.11.18', true)).toThrow('not known');
  });

  it('stops on a tag that is not a release', () => {
    expect(() => decide(status('Published'), submission('26.11.15.0'), 'latest', true)).toThrow('release tag');
  });
});

describe('run', () => {
  const folders: string[] = [];
  const write = (name: string, text: string) => {
    const folder = folders.at(-1) ?? folders[folders.push(mkdtempSync(join(tmpdir(), 'store-submission-'))) - 1];
    writeFileSync(join(folder, name), text);
    return join(folder, name);
  };

  afterEach(() => {
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
  });

  it('writes the submission with the notes, by language', () => {
    const file = write('draft.json', `Pending\n${JSON.stringify({ Listings: { 'en-us': { BaseListing: {} }, 'hu-hu': { BaseListing: {} } } })}`);
    const result = join(folders[0], 'metadata.json');

    run(['notes', file, result, 'Fixes.', 'hu=Javítások.'], {});

    const { Listings } = JSON.parse(readFileSync(result, 'utf8'));
    expect([Listings['en-us'].BaseListing.ReleaseNotes, Listings['hu-hu'].BaseListing.ReleaseNotes]).toEqual(['Fixes.', 'Javítások.']);
  });

  it('writes the decision to the output file of the step', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = write('status.txt', 'Submission Status = Certification\n');
    const submission = write('store.json', JSON.stringify({ ApplicationPackages: [{ Version: '26.11.18.0' }] }));
    const output = write('output.txt', '');

    run(['decide', status, submission, 'v26.11.19', 'True'], { GITHUB_OUTPUT: output });

    expect(readFileSync(output, 'utf8')).toMatch(/^submit=false\nreason=The last submission is Certification/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Certification'));
  });

  it('decides without an output file, and a manual run is stopped by a submission in progress', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = write('status.txt', 'Submission Status = Certification\n');
    const submission = write('store.json', JSON.stringify({ ApplicationPackages: [{ Version: '26.11.18.0' }] }));

    expect(() => run(['decide', status, submission, 'v26.11.19', 'false'], {})).toThrow('Certification');
    expect(() => run(['decide', status, submission, 'v26.11.19', 'true'], {})).not.toThrow();
  });

  it('stops on an unpublished status and checks a release against the packages', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const submission = write('store.json', JSON.stringify({ ApplicationPackages: [{ Version: '26.11.15.0' }] }));

    expect(() => run(['status', write('status.txt', 'Submission Status = Certification')], {})).toThrow('not Published');
    expect(() => run(['status', write('published.txt', 'Submission Status = Published')], {})).not.toThrow();
    expect(() => run(['check', 'v26.11.18', submission, '26.11.18.0', '26.11.18.0'], {})).not.toThrow();
    expect(() => run(['check', 'v26.11.18', submission, '26.11.18.1'], {})).toThrow('26.11.18.1');
  });

  it('says how it is used for another command', () => {
    expect(() => run(['publish'], {})).toThrow('usage');
  });
});
