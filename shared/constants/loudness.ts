/** The version of the algorithm and of the shape of the analysis; a change of either raises it, and the tracks measured with an older one are measured again */
export const analysisVersion = 1;

/** How many tracks a request to measure the ones that are queued or play asks for at most: the next ones that play */
export const maxPrioritisedTracks = 50;

/** The level a track is played at, the reference level of ReplayGain 2 */
export const targetLufs = -18;
