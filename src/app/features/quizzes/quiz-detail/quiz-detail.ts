import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  QuestionType,
  QuizDetail as QuizDetailModel,
  QuizQuestion,
  QuizQuestionInput,
  QuizzesService,
} from '../quizzes.service';

interface AnswerDraft {
  text: string;
  isCorrect: boolean;
}

interface TakingState {
  selected: string[];
  text: string;
}

@Component({
  selector: 'app-quiz-detail',
  imports: [RouterLink, FormsModule],
  templateUrl: './quiz-detail.html',
  styleUrl: './quiz-detail.scss',
})
export class QuizDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly quizzesService = inject(QuizzesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly quiz = signal<QuizDetailModel | null>(null);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly questionTypes: { value: QuestionType; label: string }[] = [
    { value: 'single_choice', label: 'Opción única' },
    { value: 'multiple_choice', label: 'Opción múltiple' },
    { value: 'true_false', label: 'Verdadero / Falso' },
    { value: 'open', label: 'Pregunta abierta' },
  ];

  // --- Editar título del quiz, solo docente/administrador ---
  readonly titleEditing = signal(false);
  readonly titleSaving = signal(false);
  protected readonly titleInput = signal('');

  // --- Agregar/editar pregunta, solo docente/administrador ---
  readonly questionFormOpenFor = signal<'new' | string | null>(null);
  readonly questionSaving = signal(false);
  readonly questionFormError = signal<string | null>(null);
  protected readonly questionPrompt = signal('');
  protected readonly questionType = signal<QuestionType>('single_choice');
  protected readonly questionAnswers = signal<AnswerDraft[]>([]);

  // --- Eliminar pregunta, solo docente/administrador ---
  readonly pendingDeleteQuestion = signal<QuizQuestion | null>(null);
  readonly deletingQuestion = signal(false);
  readonly deleteQuestionError = signal<string | null>(null);

  // --- Responder el quiz, solo alumno: una pregunta a la vez ---
  readonly takingAnswers = signal<Record<string, TakingState>>({});
  readonly currentQuestionIndex = signal(0);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly currentQuestion = computed(() => {
    const quiz = this.quiz();
    if (!quiz) return null;
    return quiz.questions[this.currentQuestionIndex()] ?? null;
  });

  readonly isLastQuestion = computed(() => {
    const quiz = this.quiz();
    if (!quiz) return true;
    return this.currentQuestionIndex() >= quiz.questions.length - 1;
  });

  readonly takingProgressPercent = computed(() => {
    const quiz = this.quiz();
    if (!quiz || quiz.questions.length === 0) return 0;
    return ((this.currentQuestionIndex() + 1) / quiz.questions.length) * 100;
  });

  private readonly quizId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  constructor() {
    effect(() => {
      void this.loadQuiz(this.quizId());
    });
  }

  getAnswerState(questionId: string): TakingState {
    return this.takingAnswers()[questionId] ?? { selected: [], text: '' };
  }

  isAnswerSelected(questionId: string, answerId: string): boolean {
    return this.getAnswerState(questionId).selected.includes(answerId);
  }

  selectSingleAnswer(questionId: string, answerId: string): void {
    this.takingAnswers.update((current) => ({
      ...current,
      [questionId]: { selected: [answerId], text: '' },
    }));
  }

  toggleMultipleAnswer(questionId: string, answerId: string, checked: boolean): void {
    this.takingAnswers.update((current) => {
      const state = current[questionId] ?? { selected: [], text: '' };
      const selected = checked
        ? [...state.selected, answerId]
        : state.selected.filter((id) => id !== answerId);
      return { ...current, [questionId]: { selected, text: '' } };
    });
  }

  setOpenAnswerText(questionId: string, text: string): void {
    this.takingAnswers.update((current) => ({
      ...current,
      [questionId]: { selected: [], text },
    }));
  }

  answerLetter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  goToPreviousQuestion(): void {
    this.currentQuestionIndex.update((i) => Math.max(0, i - 1));
  }

  goToNextQuestion(): void {
    const quiz = this.quiz();
    if (!quiz) return;
    this.currentQuestionIndex.update((i) => Math.min(quiz.questions.length - 1, i + 1));
  }

  async submitQuiz(): Promise<void> {
    const quiz = this.quiz();
    if (!quiz || this.submitting()) return;

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      const answers = quiz.questions.map((question) => {
        const state = this.getAnswerState(question.id);
        return question.type === 'open'
          ? { questionId: question.id, text: state.text }
          : { questionId: question.id, selectedAnswerIds: state.selected };
      });

      await this.quizzesService.submitAttempt(quiz.id, answers);
      await this.router.navigate(['/quizzes', quiz.id, 'resultado']);
    } catch {
      this.submitError.set('No se pudo enviar el quiz. Intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  startEditTitle(): void {
    const quiz = this.quiz();
    if (!quiz) return;
    this.titleInput.set(quiz.title);
    this.titleEditing.set(true);
  }

  cancelEditTitle(): void {
    if (this.titleSaving()) return;
    this.titleEditing.set(false);
  }

  async saveTitle(): Promise<void> {
    const quiz = this.quiz();
    const title = this.titleInput().trim();
    if (!quiz || !title || this.titleSaving()) return;

    this.titleSaving.set(true);

    try {
      await this.quizzesService.updateQuizTitle(quiz.id, title);
      this.quiz.update((current) => (current ? { ...current, title } : current));
      this.titleEditing.set(false);
    } finally {
      this.titleSaving.set(false);
    }
  }

  openNewQuestionForm(): void {
    this.questionPrompt.set('');
    this.questionType.set('single_choice');
    this.questionAnswers.set([
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ]);
    this.questionFormError.set(null);
    this.questionFormOpenFor.set('new');
  }

  openEditQuestionForm(question: QuizQuestion): void {
    this.questionPrompt.set(question.prompt);
    this.questionType.set(question.type);
    this.questionAnswers.set(question.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect ?? false })));
    this.questionFormError.set(null);
    this.questionFormOpenFor.set(question.id);
  }

  cancelQuestionForm(): void {
    if (this.questionSaving()) return;
    this.questionFormOpenFor.set(null);
  }

  onQuestionTypeChange(type: QuestionType): void {
    this.questionType.set(type);
    if (type === 'open') {
      this.questionAnswers.set([]);
    } else if (this.questionAnswers().length === 0) {
      this.questionAnswers.set([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ]);
    }
  }

  addAnswerRow(): void {
    this.questionAnswers.update((current) => [...current, { text: '', isCorrect: false }]);
  }

  removeAnswerRow(index: number): void {
    this.questionAnswers.update((current) => current.filter((_, i) => i !== index));
  }

  setAnswerText(index: number, text: string): void {
    this.questionAnswers.update((current) => current.map((a, i) => (i === index ? { ...a, text } : a)));
  }

  setAnswerCorrect(index: number, checked: boolean): void {
    this.questionAnswers.update((current) =>
      this.questionType() === 'multiple_choice'
        ? current.map((a, i) => (i === index ? { ...a, isCorrect: checked } : a))
        : current.map((a, i) => ({ ...a, isCorrect: i === index })),
    );
  }

  async saveQuestionForm(form: NgForm): Promise<void> {
    const quiz = this.quiz();
    const target = this.questionFormOpenFor();
    if (form.invalid || !quiz || target === null || this.questionSaving()) return;

    const type = this.questionType();
    const answers = this.questionAnswers()
      .map((a) => ({ text: a.text.trim(), isCorrect: a.isCorrect }))
      .filter((a) => a.text.length > 0);

    if (type !== 'open') {
      if (answers.length < 2) {
        this.questionFormError.set('Agrega al menos dos opciones de respuesta.');
        return;
      }
      if (!answers.some((a) => a.isCorrect)) {
        this.questionFormError.set('Marca cuál opción es la correcta.');
        return;
      }
    }

    this.questionSaving.set(true);
    this.questionFormError.set(null);

    try {
      const input: QuizQuestionInput = { prompt: this.questionPrompt().trim(), type, answers };

      if (target === 'new') {
        const nextOrder = quiz.questions.reduce((max, q) => Math.max(max, q.order), 0) + 1;
        await this.quizzesService.createQuestion(quiz.id, nextOrder, input);
      } else {
        await this.quizzesService.updateQuestion(target, input);
      }

      await this.loadQuiz(quiz.id);
      this.questionFormOpenFor.set(null);
    } catch {
      this.questionFormError.set('No se pudo guardar la pregunta. Intenta de nuevo.');
    } finally {
      this.questionSaving.set(false);
    }
  }

  requestDeleteQuestion(question: QuizQuestion): void {
    if (this.deletingQuestion()) return;
    this.deleteQuestionError.set(null);
    this.pendingDeleteQuestion.set(question);
  }

  cancelDeleteQuestion(): void {
    if (this.deletingQuestion()) return;
    this.pendingDeleteQuestion.set(null);
  }

  async confirmDeleteQuestion(): Promise<void> {
    const question = this.pendingDeleteQuestion();
    const quiz = this.quiz();
    if (!question || !quiz || this.deletingQuestion()) return;

    this.deletingQuestion.set(true);
    this.deleteQuestionError.set(null);

    try {
      await this.quizzesService.deleteQuestion(question.id);
      await this.loadQuiz(quiz.id);
      this.pendingDeleteQuestion.set(null);
    } catch {
      this.deleteQuestionError.set('No se pudo eliminar la pregunta. Intenta de nuevo.');
    } finally {
      this.deletingQuestion.set(false);
    }
  }

  private async loadQuiz(quizId: string | null): Promise<void> {
    this.quiz.set(null);
    this.takingAnswers.set({});
    this.currentQuestionIndex.set(0);
    this.titleEditing.set(false);
    this.questionFormOpenFor.set(null);

    if (!quizId) {
      this.loading.set(false);
      this.error.set('Quiz no encontrado.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const quiz = this.canManage()
        ? await this.quizzesService.getQuizForManage(quizId)
        : await this.quizzesService.getQuizForTaking(quizId);
      this.quiz.set(quiz);
    } catch {
      this.error.set('No pudimos cargar este quiz. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
