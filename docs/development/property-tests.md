# Property tests

What reads bytes that the app did not write is tested with [fast-check](https://fast-check.dev) as well as with examples: thousands of generated files and streams, and one property that all of them have to keep. They are unit tests (`*.property.test.ts` next to the code, [unit-tests.md](unit-tests.md)) and run with `npm test`.

| Reader | Test | What it keeps |
| --- | --- | --- |
| WAV and RF64, MP4 and FLAC slicers | `client/loudness/slicing/slicers.property.test.ts` | pieces or a `SliceError`, a bounded number of reads of ranges that are ranges; all the sound of a valid file |
| RF64 and Wave64, DST length | `electron/library/reading/large-files.property.test.ts` | a finite length that is not negative, nothing, or an error with a text of the reader |
| ICY metadata of a station | `electron/protocols/icy-metadata.property.test.ts` | the same audio and titles however the stream is cut into chunks |
| M3U, PLS and XSPF | `electron/library/playlists/formats/parse-playlist.property.test.ts` | never throws; each entry has a location, and a finite length or none; reads the locations the app writes |

## Seed and number of cases

Each run generates the same cases (`shared/test-properties.ts`: seed 597, 300 cases), so CI does not fail on a pull request that did not touch the reader, and a failure shows again. To look for new faults, run other cases, and more of them:

```sh
PROPERTY_SEED=1 PROPERTY_RUNS=5000 npx vitest run property.test --testTimeout=300000
```

A failure prints the counterexample, already shrunk. Fix the reader and add the counterexample as an example to the test of the reader (`name.test.ts`), which does not depend on what a new version of fast-check generates.

## Writing one

- Random bytes are refused by the first check of a reader. `damaged()` of `shared/test-damaged-bytes.ts` starts from a valid file, overwrites a few words with the numbers that lengths go wrong with, and may cut it short; use it, and random bytes behind a valid start.
- A reader that does not stop makes a test hang, not fail: Vitest cannot interrupt a loop that does not wait. Give the mocked file a limit of reads.
- A mocked `read` of a file refuses what Node refuses (a position that is no safe integer), or the fault only shows with a real file.

## What they found

The first run (issue #597) found these, each fixed with an example test:

| Symptom | Cause |
| --- | --- |
| A `RangeError` from an MP4 or WAV file, which the loudness measurement does not take as a fault of the file | a `DataView` read past a box or chunk that is shorter than its fields |
| Gigabytes of memory, or millions of reads, for a small MP4 | a count of samples or chunks that nothing compared with the box or the file |
| A read of a range that ends before it starts (FLAC) | metadata that goes past the end of the file |
| A length of `Infinity` from RF64, Wave64 or a playlist | no bytes a second, or a number with hundreds of digits |
| `ERR_OUT_OF_RANGE` from DST and Wave64 | a 64 bit size that points past what a file can be read at |
| A stream title or a file name that is dropped | a line separator (U+2028), which `.` of a regular expression does not match without the `s` flag |
| `&constructor;` in XSPF became the text of a function, and exporting a file named `constructor` to M3U threw | a lookup in an object finds the properties that every object has (`Object.hasOwn`) |

Reading the callers for these tests also showed that a station with `icy-metaint: 1.5` had `IcyMetadataStripper` loop on one chunk in the main process until the heap was full (4 GB after 12 seconds): only a whole number is taken now. Check it by calling `_transform` of a stripper made with 1.5.
