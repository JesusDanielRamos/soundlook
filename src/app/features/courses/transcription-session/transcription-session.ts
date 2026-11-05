import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  TranscriptionLine,
  TranscriptionService,
  TranscriptionSession as TranscriptionSessionModel,
} from '../transcription.service';

// La Web Speech API no está en las librerías de TS todavía — tipos mínimos
// para lo que usamos aquí.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

@Component({
  selector: 'app-transcription-session',
  imports: [RouterLink, DatePipe],
  templateUrl: './transcription-session.html',
  styleUrl: './transcription-session.scss',
})
export class TranscriptionSessionPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly transcriptionService = inject(TranscriptionService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly session = signal<TranscriptionSessionModel | null>(null);
  readonly lines = signal<TranscriptionLine[]>([]);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly isLive = computed(() => this.session()?.status === 'live');

  // --- Transcripción en vivo (solo quien inició la sesión la controla) ---
  readonly broadcasting = signal(false);
  readonly interimText = signal('');
  readonly micSupported = signal(this.detectSupport());
  readonly micError = signal<string | null>(null);
  readonly endingSession = signal(false);

  private readonly panelRef = viewChild<ElementRef<HTMLDivElement>>('panel');

  private recognition: SpeechRecognitionLike | null = null;
  private stoppedByUser = true;
  private nextOrder = 0;
  private linesChannel: RealtimeChannel | null = null;
  private statusChannel: RealtimeChannel | null = null;

  private readonly sessionId = toSignal(this.route.paramMap.pipe(map((params) => params.get('sessionId'))), {
    initialValue: this.route.snapshot.paramMap.get('sessionId'),
  });

  constructor() {
    effect(() => {
      void this.load(this.sessionId());
    });

    effect(() => {
      this.lines();
      this.interimText();
      queueMicrotask(() => {
        const el = this.panelRef()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  startBroadcast(): void {
    if (this.broadcasting()) return;
    this.micError.set(null);

    const ctor = this.resolveCtor();
    if (!ctor) {
      this.micSupported.set(false);
      return;
    }

    const recognition = new ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-MX';

    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) {
            void this.persistLine(trimmed);
          }
        } else {
          interim += text;
        }
      }

      this.interimText.set(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.micError.set('Necesitas dar permiso de micrófono en tu navegador para transmitir.');
        this.stoppedByUser = true;
        this.broadcasting.set(false);
        return;
      }

      this.micError.set('Hubo un problema con el reconocimiento de voz. Intenta de nuevo.');
    };

    recognition.onend = () => {
      if (!this.stoppedByUser) {
        recognition.start();
      } else {
        this.broadcasting.set(false);
      }
    };

    this.stoppedByUser = false;
    this.recognition = recognition;
    this.interimText.set('');
    recognition.start();
    this.broadcasting.set(true);
  }

  stopBroadcast(): void {
    this.stoppedByUser = true;
    this.recognition?.stop();
    this.broadcasting.set(false);
    this.interimText.set('');
  }

  async endSession(): Promise<void> {
    const session = this.session();
    if (!session || this.endingSession()) return;

    this.stopBroadcast();
    this.endingSession.set(true);

    try {
      await this.transcriptionService.endSession(session.id);
      this.session.update((current) => (current ? { ...current, status: 'ended' } : current));
    } catch {
      this.micError.set('No se pudo finalizar la sesión. Intenta de nuevo.');
    } finally {
      this.endingSession.set(false);
    }
  }

  private async persistLine(text: string): Promise<void> {
    const session = this.session();
    if (!session) return;

    try {
      await this.transcriptionService.addLine(session.id, text, this.nextOrder++);
    } catch {
      this.micError.set('No se pudo guardar una línea de la transcripción.');
    }
  }

  private async load(sessionId: string | null): Promise<void> {
    this.cleanupChannels();
    this.session.set(null);
    this.lines.set([]);

    if (!sessionId) {
      this.loading.set(false);
      this.error.set('Sesión no encontrada.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [session, lines] = await Promise.all([
        this.transcriptionService.getSession(sessionId),
        this.transcriptionService.getLines(sessionId),
      ]);

      if (!session) {
        this.error.set('No encontramos esta sesión.');
        return;
      }

      this.session.set(session);
      this.lines.set(lines);
      this.nextOrder = lines.length;

      this.linesChannel = this.transcriptionService.subscribeToLines(sessionId, (line) => {
        this.lines.update((current) =>
          current.some((l) => l.id === line.id) ? current : [...current, line].sort((a, b) => a.order - b.order),
        );
      });

      if (session.status === 'live') {
        this.statusChannel = this.transcriptionService.subscribeToSessionStatus(sessionId, (status, endedAt) => {
          this.session.update((current) => (current ? { ...current, status, endedAt } : current));
          if (status === 'ended') {
            this.stopBroadcast();
          }
        });
      }
    } catch {
      this.error.set('No pudimos cargar esta sesión. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }

  private cleanupChannels(): void {
    if (this.linesChannel) {
      void this.transcriptionService.unsubscribe(this.linesChannel);
      this.linesChannel = null;
    }
    if (this.statusChannel) {
      void this.transcriptionService.unsubscribe(this.statusChannel);
      this.statusChannel = null;
    }
  }

  private resolveCtor(): SpeechRecognitionCtor | null {
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
  }

  private detectSupport(): boolean {
    return typeof window !== 'undefined' && this.resolveCtor() !== null;
  }

  ngOnDestroy(): void {
    this.stopBroadcast();
    this.cleanupChannels();
  }
}
