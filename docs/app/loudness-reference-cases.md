# Loudness: the EBU reference cases

[EBU Tech 3341](https://tech.ebu.ch/docs/tech/tech3341.pdf) and [Tech 3342](https://tech.ebu.ch/docs/tech/tech3342.pdf) (both November 2023) list test signals a loudness meter has to answer within a tolerance. `client/loudness/ebu-reference.test.ts` makes the signals at 48 kHz, 1 kHz tones with the given peak level in each channel, and measures them with `createBlockMeter` and `summarise`, see [loudness measurement](loudness-measurement.md). Nothing is decoded.

## Tested

| Document | Cases | What is checked | Tolerance |
|---|---|---|---|
| 3341 | 1, 2 | integrated loudness, and the momentary loudness of every 400 ms block | ±0.1 LU |
| 3341 | 3, 4, 5 | integrated loudness, through the gates | ±0.1 LU |
| 3341 | 6 | integrated loudness of 5.0, through the surround weights | ±0.1 LU |
| 3341 | 12 | momentary loudness from 1 s on | ±0.1 LU |
| 3342 | 1 to 4 | loudness range | ±1 LU |

On 2026-11-27 all passed: every loudness was within 0.05 LU, and the four ranges were exact to 0.001 LU.

## Not tested

| Document | Cases | Why |
|---|---|---|
| 3341 | 7, 8 | real programme material, the files of the EBU, which the repository does not have |
| 3342 | 5, 6 | the same |
| 3341 | 9 to 11 | short term loudness, which the app does not report (the stored `shortTerm` curve is the mean of the momentary blocks in each 256th of the track) |
| 3341 | 13, 14 | the highest momentary loudness, which the app does not report; its blocks start every 100 ms and the signals are offset in steps of 20 ms |
| 3341 | 15 to 23 | true peak; the app measures the sample peak |

## Where the app differs from Tech 3342

The four range cases hold each level for 20 s, so they do not see these:

- **Short term values every 1 s.** Tech 3342 (section 3.1, since 2016) asks for windows of 3 s that overlap by at least 2.9 s, one every 100 ms. `loudnessRange` takes one every second (`shortTermStep`). The cases also pass with one every 100 ms. Changing it changes the stored `loudnessRange`, so it needs a new `analysisVersion`, which measures every library again. The gain does not use the range.
- **The shape of the window.** A short term value is the mean of the 27 blocks of 400 ms in 3 s, so the first and last 300 ms count less than the middle.
- **Percentiles** are interpolated between two values, where the MATLAB code of the document rounds to one. The document allows other implementations that stay within the tolerances.

## What the cases catch

Breaking a rule in the code on purpose (2026-11-27) failed these: a surround weight of 1 (3341 case 6), a relative gate of -20 LU for the integrated loudness (3341 cases 3 and 4), a relative gate of -10 LU for the range (3342 case 3), and a low percentile of 50 % (3342 cases 1 to 3). An absolute gate of -80 LUFS passed all of them, as the relative gate still leaves out the quiet tones; `summarise.test.ts` checks blocks 0.1 LU on each side of that gate.

## Reading the documents

Text copied or extracted from the two PDFs can lose the minus signs, so a level such as -23.0 dBFS reads as 23.0. Every level in Table 1 of both documents that the tests use is negative.
