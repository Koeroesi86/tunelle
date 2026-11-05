/** The loudest bin of each of `bandCount` bands, spaced logarithmically like hearing, so the bass does not take all the bars */
export const getBandValues = (data: Uint8Array, bandCount: number) => {
  const edges = Array.from({ length: bandCount + 1 }, (_, i) => Math.round(data.length ** (i / bandCount)));

  return edges.slice(0, bandCount).map((start, i) => Math.max(...data.subarray(start, Math.max(edges[i + 1], start + 1))));
};
