# Patents of the codecs in the ffmpeg build

What was found about patents, and what is open. Part of [The ffmpeg build](ffmpeg-build.md).

## Patents

WMA is in the build ([#347](https://github.com/Koeroesi86/tunelle/issues/347)): the patent that describes the codec, [US 7,158,539 B2](https://patents.google.com/patent/US7158539B2/en), has expired, and the notice shipped with the app (`packaging/ffmpeg/NOTICE.txt`) refers to it. This is the maintainer's reading, not legal advice, and other claims on the codec may exist. The Flathub question stays open for all of them. E-AC-3 stays out of the build until the maintainer decides.

### Research for MP3, AAC and Opus (2026-11-24)

Not legal advice: a web search, not a patent database, so every date below is a third party's claim. Nothing of these three is in the build yet; each waits for the decision of the maintainer ([#470](https://github.com/Koeroesi86/tunelle/issues/470), [#471](https://github.com/Koeroesi86/tunelle/issues/471), [#469](https://github.com/Koeroesi86/tunelle/issues/469)).

- **MP3:** Technicolor and Fraunhofer ended their MP3 licensing programme on 23 April 2017. The last US patents are reported to have expired by April 2017 and the European ones around 2012. Fraunhofer's announcement gives no dates, and a third party may still hold a patent. Lowest risk of the three.
- **AAC:** AAC-LC is reported expired around 2017 (a forum claim; Fedora ships an AAC-LC only decoder on that reading). The Via LA AAC programme is still running and covers HE-AAC v1 and v2. Some Philips patents of the pool expired on 22 April 2023, a trade article puts the baseline technologies at 2028 and some extensions at 2031, and the two do not agree. If AAC comes in, AAC-LC and ADTS are the safer part; HE-AAC (SBR, PS) and the `.m4b` and `.m4r` variants need the decision.
- **Opus:** Xiph, Broadcom and Microsoft grant royalty-free licences, which end for anyone who sues Opus users. Qualcomm, Huawei, France Telecom and Ericsson filed IETF disclosures with possibly royalty-bearing terms. Vectis IP started a paid pool in January 2023 (Fraunhofer and Dolby, over 300 patents, about 15 cents a unit) aimed at hardware makers; Vectis says open implementations, apps and services are not affected, and whether the patents read on Opus is disputed.
- **Flathub:** no written policy on bundling MP3 or AAC was found. Flathub ships patented codecs as an `ffmpeg-full` extension that an app opts into, so a bundled decoder still needs a check.

Sources: Via LA AAC programme (via-la.com/licensing-2/aac), Opus license (opus-codec.org/license), IPWatchdog on the Vectis pool, LWN 910848, Mozilla Connect "Native AAC-LC decoding (patents expired)", The Broadcast Bridge on HE-AAC, Techdirt and Slashdot on the end of the MP3 programme.

### Research for MP2 (2026-11-24)

Not legal advice, and the same limits as above: secondary sources only, no patent database, no date below is checked. MP2 (MPEG-1 Audio Layer II, from the MUSICAM format) is in the build ([#347](https://github.com/Koeroesi86/tunelle/issues/347)) and in `flatpakExcluded`.

- Nobody was found who gives an expiry date for the Layer II patents. A Fedora legal list post by a non-lawyer reasons from the age of ISO 11172 (1993) that patents on it are highly likely expired, which is an estimate from the 20 year term, not a finding.
- Wikipedia's article on TooLAME says that the use of MP2 was basically unrestricted while MP3 faced the Fraunhofer and Thomson claims, and a legacy codecs article says the Layer II patents ran out before the MP3 ones. Both are third party statements.
- The MPEG-2 video and systems patents are reported expired in February 2018 (Slashdot, TechRepublic). That is a different part of the standard and is no evidence for audio.
- Flathub: the same open question as for MP3.

Sources: [Fedora legal list thread](https://lists.fedoraproject.org/archives/list/legal@lists.fedoraproject.org/thread/EAE7SDSHLA3S3D3APIDRDW22LQANFTSE/), [TooLAME on Wikipedia](https://en.wikipedia.org/wiki/TooLAME), [MP3 and MP2 legacy codecs](https://www.forasoft.com/learn/audio-for-video/articles-audio/mp3-mp2-legacy-codecs), [Slashdot on MPEG-2](https://yro.slashdot.org/story/18/02/14/1621259/mpeg-2-patents-have-expired), [TechRepublic on MPEG-2](https://www.techrepublic.com/article/mpeg-2-patent-expiration-opens-door-for-royalty-free-use/).

### Research for AC-3 (2026-11-24)

Not legal advice, the same limits as above. AC-3 (Dolby Digital) is in the build as the `ac3` decoder, for AC-3 in an `.m4a`, and in `flatpakExcluded`.

- A post on the FFmpeg developer list (2018) says that all Dolby AC-3 patents expired in February 2017, and a Hydrogenaudio reply calls the decoding patents expired. Neither is a lawyer, and the 2018 post suggests asking Dolby.
- A patent expiry does not cover the Dolby name and logo: a reply on the FFmpeg user list says a licence is most likely needed to use them, so the app does not show them. Dolby offers its own licensed plugins for ffmpeg, which this build does not use.
- E-AC-3 (Dolby Digital Plus) is less settled: a MainConcept blog says its patents were in force until early 2026, a Hydrogenaudio reply says some US patents were still live, and neither says what the state is now. It is not in the build.

Sources: [FFmpeg-devel, 2018](https://ffmpeg.org/pipermail/ffmpeg-devel/2018-October/234947.html), [FFmpeg libav-user, 2022](https://ffmpeg.org/pipermail/libav-user/2022-August/013128.html), [Hydrogenaudio](https://hydrogenaudio.org/index.php/topic,122053.0.html), [MainConcept on Dolby Digital in ffmpeg](https://blog.mainconcept.com/dolby-digital-audio-in-ffmpeg).

### Research for DST (2026-11-25)

Not legal advice, the same limits as above: a web search and three Google Patents pages, not a search of the patent families. DST (ISO/IEC 14496-3 subpart 10, developed by Philips for SACD) is in the build as the `dst` decoder and in `flatpakExcluded`.

- The Philips patents on lossless coding of 1 bit audio that were found are shown as expired: [US 6,269,338](https://patents.google.com/patent/US6269338B1/en) (anticipated expiry 25 September 2017), its continuation [US 7,225,136](https://patents.google.com/patent/US7225136B2/en) (adjusted expiry 16 July 2024) and [EP 1605596](https://patents.google.com/patent/EP1605596B1/en) on the arithmetic coding (anticipated expiry 22 February 2019).
- No list of the patents that DST needs was found, so others may exist. That is why it stays out of the Flatpak.

## Not decided here

The checks of the Microsoft Store (WACK) on the program are a later item of the issue.
