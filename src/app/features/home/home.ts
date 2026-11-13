import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface WaveformBar {
  x: number;
  bg: number;
  fg: number;
}

// Amplitud relativa (0-1) de cada barra — a mano, para que se vea como un
// enunciado real (unos "picos" de voz separados por silencios) en vez de
// barras parejas o puramente aleatorias.
const WAVEFORM_AMPLITUDES = [
  0.15, 0.25, 0.4, 0.6, 0.8, 0.65, 0.45, 0.3, 0.2, 0.35, 0.55, 0.75, 0.95, 1, 0.85, 0.6, 0.4, 0.25, 0.4, 0.6, 0.8, 0.9,
  0.7, 0.5, 0.35, 0.22, 0.12,
];

const WAVE_MARGIN_X = 24;
const WAVE_WIDTH = 400 - WAVE_MARGIN_X * 2;
const WAVE_BG_MAX_HALF = 100;
const WAVE_FG_MAX_HALF = 70;

function buildWaveformBars(): WaveformBar[] {
  const slot = WAVE_WIDTH / WAVEFORM_AMPLITUDES.length;

  return WAVEFORM_AMPLITUDES.map((value, i) => ({
    x: WAVE_MARGIN_X + slot * (i + 0.5),
    bg: Math.max(5, value * WAVE_BG_MAX_HALF),
    fg: Math.max(3, value * WAVE_FG_MAX_HALF),
  }));
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly waveformBars = buildWaveformBars();
}
