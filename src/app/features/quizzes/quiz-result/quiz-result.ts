import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  QuizAttemptAnswerInput,
  QuizAttemptSummary,
  QuizDetail,
  QuizQuestion,
  QuizzesService,
} from '../quizzes.service';

@Component({
  selector: 'app-quiz-result',
  imports: [RouterLink, DatePipe],
  templateUrl: './quiz-result.html',
  styleUrl: './quiz-result.scss',
})
export class QuizResult {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly quizzesService = inject(QuizzesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly quiz = signal<QuizDetail | null>(null);
  readonly attempts = signal<QuizAttemptSummary[]>([]);
  readonly expandedAttemptId = signal<string | null>(null);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  // Para un alumno: solo su intento más reciente.
  readonly myLatestAttempt = computed(() => this.attempts()[0] ?? null);

  readonly totalClosedQuestions = computed(
    () => this.quiz()?.questions.filter((q) => q.type !== 'open').length ?? 0,
  );

  readonly myCorrectCount = computed(() => {
    const quiz = this.quiz();
    const attempt = this.myLatestAttempt();
    if (!quiz || !attempt) return 0;

    return quiz.questions.filter(
      (q) => q.type !== 'open' && this.isQuestionCorrect(q, this.findAnswer(attempt, q.id)) === true,
    ).length;
  });

  readonly resultMessage = computed(() => {
    const score = this.myLatestAttempt()?.score;
    if (score === null || score === undefined) return 'Respuestas registradas';
    if (score >= 90) return '¡Excelente!';
    if (score >= 70) return '¡Buen resultado!';
    if (score >= 50) return 'Vas por buen camino';
    return 'Sigue practicando';
  });

  private readonly quizId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  constructor() {
    effect(() => {
      void this.load(this.quizId());
    });
  }

  toggleAttempt(attemptId: string): void {
    this.expandedAttemptId.update((current) => (current === attemptId ? null : attemptId));
  }

  isExpanded(attemptId: string): boolean {
    return this.expandedAttemptId() === attemptId;
  }

  findQuestion(questionId: string): QuizQuestion | null {
    return this.quiz()?.questions.find((q) => q.id === questionId) ?? null;
  }

  findAnswer(attempt: QuizAttemptSummary, questionId: string): QuizAttemptAnswerInput | null {
    return attempt.answers.find((a) => a.questionId === questionId) ?? null;
  }

  selectedAnswerTexts(question: QuizQuestion, answer: QuizAttemptAnswerInput | null): string[] {
    if (!answer?.selectedAnswerIds?.length) return [];
    return question.answers
      .filter((a) => answer.selectedAnswerIds!.includes(a.id))
      .map((a) => a.text);
  }

  correctAnswerTexts(question: QuizQuestion): string[] {
    return question.answers.filter((a) => a.isCorrect).map((a) => a.text);
  }

  isQuestionCorrect(question: QuizQuestion, answer: QuizAttemptAnswerInput | null): boolean | null {
    if (question.type === 'open') return null;

    const correctIds = question.answers.filter((a) => a.isCorrect).map((a) => a.id);
    const selectedIds = answer?.selectedAnswerIds ?? [];
    if (correctIds.length !== selectedIds.length) return false;

    const correctSet = new Set(correctIds);
    return selectedIds.every((id) => correctSet.has(id));
  }

  private async load(quizId: string | null): Promise<void> {
    this.quiz.set(null);
    this.attempts.set([]);
    this.expandedAttemptId.set(null);

    if (!quizId) {
      this.loading.set(false);
      this.error.set('Quiz no encontrado.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userId = this.auth.session()?.user.id ?? null;

      if (this.canManage()) {
        const [quiz, attempts] = await Promise.all([
          this.quizzesService.getQuizForManage(quizId),
          this.quizzesService.getAttempts(quizId),
        ]);
        this.quiz.set(quiz);
        this.attempts.set(attempts);
      } else {
        const [quiz, attempts] = await Promise.all([
          this.quizzesService.getQuizForManage(quizId),
          userId ? this.quizzesService.getAttempts(quizId) : Promise.resolve([]),
        ]);
        this.quiz.set(quiz);
        this.attempts.set(attempts.filter((a) => a.userId === userId));
      }
    } catch {
      this.error.set('No pudimos cargar las calificaciones. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
