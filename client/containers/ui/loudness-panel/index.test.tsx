import { describe, expect, it, vi } from 'vitest';
import { fetchLoudnessAnalysis } from '../../../services/library-api';
import View from '../../../components/ui/loudness-panel/LoudnessPanel';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/ui/loudness-panel/LoudnessPanel', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../audio/context', async () => ({ Audio: (await import('react')).createContext({}) }));
vi.mock('../../../services/library-api', () => ({ fetchLoudnessAnalysis: vi.fn() }));
vi.mock('../../../hooks/use-output-sample-rate', () => ({ useOutputSampleRate: () => 48000 }));

describe('the container of LoudnessPanel', () => {
  it('gives the panel the position, the status, the rate of the output and the analysis of the library', () => {
    renderContainer(<Container path="/music/a.flac" />, (state) => ({ ...state, uiState: { ...state.uiState, currentTime: 42 } }));

    expect(propsOf(View)).toMatchObject({ path: '/music/a.flac', currentTime: 42, status: undefined, outputRate: 48000, fetchAnalysis: fetchLoudnessAnalysis });
  });
});
