import { describe, expect, it } from 'vitest';
import { IcyMetadataStripper, parseStreamTitle, parseStreamUrl } from './icyMetadata';

const metadataBlock = (text: string | Buffer) => {
  const body = Buffer.from(text);
  const padded = Buffer.alloc(Math.ceil(body.length / 16) * 16);
  body.copy(padded);
  return Buffer.concat([Buffer.from([padded.length / 16]), padded]);
};

const strip = async (metaint: number, chunks: Buffer[]) => {
  const titles: string[] = [];
  const stripper = new IcyMetadataStripper(metaint, (title) => titles.push(title));
  const audio: Buffer[] = [];
  stripper.on('data', (data: Buffer) => audio.push(data));
  chunks.forEach((chunk) => stripper.write(chunk));
  await new Promise((resolve) => stripper.end(resolve));
  return { audio: Buffer.concat(audio).toString(), titles };
};

describe('parseStreamUrl', () => {
  it('reads the address next to the title', () => {
    expect(parseStreamUrl("StreamTitle='A - B';StreamUrl='https://x.example/c.jpg';")).toBe('https://x.example/c.jpg');
  });

  it.each(['', "StreamUrl='';", "StreamTitle='A - B';"])('has no address in %j', (metadata) => {
    expect(parseStreamUrl(metadata)).toBeUndefined();
  });
});

describe('parseStreamTitle', () => {
  it('reads the title of a metadata block', () => {
    expect(parseStreamTitle("StreamTitle='Artist - Song';StreamUrl='';")).toBe('Artist - Song');
  });

  it.each(['', "StreamTitle='';", "StreamUrl='x';"])('has no title in %j', (metadata) => {
    expect(parseStreamTitle(metadata)).toBeUndefined();
  });
});

describe('IcyMetadataStripper', () => {
  it('passes the audio through without the metadata', async () => {
    const stream = Buffer.concat([Buffer.from('aaaa'), metadataBlock("StreamTitle='One';"), Buffer.from('bbbb'), Buffer.from([0]), Buffer.from('cc')]);

    expect(await strip(4, [stream])).toEqual({ audio: 'aaaabbbbcc', titles: ['One'] });
  });

  it('handles a metadata block that is split over chunks, down to single bytes', async () => {
    const stream = Buffer.concat([Buffer.from('aaaa'), metadataBlock("StreamTitle='Split title';"), Buffer.from('bbbb')]);
    const bytes = Array.from(stream, (byte) => Buffer.from([byte]));

    expect(await strip(4, bytes)).toEqual({ audio: 'aaaabbbb', titles: ['Split title'] });
  });

  it('reports every title of the stream', async () => {
    const stream = Buffer.concat([Buffer.from('aa'), metadataBlock("StreamTitle='One';"), Buffer.from('bb'), metadataBlock("StreamTitle='Two';")]);

    expect((await strip(2, [stream])).titles).toEqual(['One', 'Two']);
  });

  it('reads a title in UTF-8', async () => {
    const { titles } = await strip(4, [Buffer.from('aaaa'), metadataBlock("StreamTitle='Beyoncé – We’re';")]);
    expect(titles).toEqual(['Beyoncé – We’re']);
  });

  it('reads a title in Windows-1252 when it is not valid UTF-8', async () => {
    const title = Buffer.concat([Buffer.from("StreamTitle='We"), Buffer.from([0x92]), Buffer.from("re Going';")]);
    const { titles } = await strip(4, [Buffer.from('aaaa'), metadataBlock(title)]);
    expect(titles).toEqual(['We’re Going']);
  });

  it('does not report an empty block', async () => {
    expect(await strip(2, [Buffer.concat([Buffer.from('aa'), Buffer.from([0]), Buffer.from('bb')])])).toEqual({ audio: 'aabb', titles: [] });
  });
});
