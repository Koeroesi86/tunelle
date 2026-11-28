/** Names of files that an address or a pattern can misread, valid on every system. See docs/development/file-names.md */
export const unusualNames = [
  { kind: 'a hash at the start', name: '#1 Hit' },
  { kind: 'a hash inside', name: 'Track #2' },
  { kind: 'a percent sign', name: '100% Sure' },
  { kind: 'what looks like an encoded space', name: 'Plain%20Text %23' },
  { kind: 'accents as one character each', name: 'Caf\u00e9 \u00c5ngstr\u00f6m' },
  { kind: 'accents as two characters each', name: 'Cafe\u0301 A\u030angstro\u0308m' },
  { kind: 'emoji', name: '\ud83c\udfb5 Song \ud83d\udc69\u200d\ud83c\udfa4' },
  { kind: 'signs of addresses and patterns', name: "R&B [live] (a+b) = 'x'; y_z!" },
];
