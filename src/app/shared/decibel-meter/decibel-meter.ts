import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

type DbZone = 'low' | 'good' | 'high' | 'clip';
type DbMode = 'auto' | 'manual';

const MIN_DB = -60;
const MAX_DB = 0;
const MANUAL_MAX_DB = 3;

@Component({
  selector: 'app-decibel-meter',
  imports: [DecimalPipe],
  templateUrl: './decibel-meter.html',
  styleUrl: './decibel-meter.scss',
})
export class DecibelMeter {
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = signal<DbMode>('auto');
  readonly db = signal(-24);

  readonly minDb = MIN_DB;
  readonly manualMaxDb = MANUAL_MAX_DB;

  private target = -24;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly percent = computed(() => {
    const clamped = Math.min(MAX_DB, Math.max(MIN_DB, this.db()));
    return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  });

  readonly zone = computed<DbZone>(() => {
    const value = this.db();
    if (value < -40) return 'low';
    if (value < -6) return 'good';
    if (value < -3) return 'high';
    return 'clip';
  });

  readonly zoneLabel = computed(() => {
    switch (this.zone()) {
      case 'low':
        return 'Muy bajo — apenas audible';
      case 'good':
        return 'Nivel adecuado';
      case 'high':
        return 'Alto — cuidado';
      case 'clip':
        return '¡Demasiado alto! Riesgo de distorsión';
    }
  });

  constructor() {
    this.start();
    this.destroyRef.onDestroy(() => this.stop());
  }

  setMode(next: DbMode): void {
    if (this.mode() === next) return;
    this.mode.set(next);

    if (next === 'auto') {
      this.start();
    } else {
      this.stop();
    }
  }

  onManualInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.db.set(Number(input.value));
  }

  private start(): void {
    if (this.intervalId !== null) return;
    this.target = this.db();
    this.pickNewTarget();
    this.intervalId = setInterval(() => this.tick(), 120);
  }

  private stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private pickNewTarget(): void {
    // Simula los picos de un audio de ejemplo, incluyendo saturación ocasional.
    this.target = MIN_DB + Math.random() * (MAX_DB - MIN_DB + 6);
  }

  private tick(): void {
    const current = this.db();
    const next = current + (this.target - current) * 0.15;
    this.db.set(next);

    if (Math.abs(next - this.target) < 0.5 || Math.random() < 0.04) {
      this.pickNewTarget();
    }
  }
}
