import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'open';

export interface QuizAnswerOption {
  id: string;
  text: string;
  order: number;
  // Solo presente cuando se carga en modo "gestión" (docente/administrador).
  // Nunca se pide al alumno mientras responde, para no filtrar la respuesta
  // correcta en la red.
  isCorrect?: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  order: number;
  answers: QuizAnswerOption[];
}

export interface QuizDetail {
  id: string;
  unitId: string;
  unitTitle: string;
  unitOrder: number;
  courseId: string;
  title: string;
  questions: QuizQuestion[];
}

export interface QuizAttemptAnswerInput {
  questionId: string;
  selectedAnswerIds?: string[];
  text?: string;
}

export interface QuizAttemptSummary {
  id: string;
  userId: string;
  studentName: string;
  score: number | null;
  createdAt: string;
  answers: QuizAttemptAnswerInput[];
}

export interface QuizQuestionInput {
  prompt: string;
  type: QuestionType;
  // Ignorado para preguntas tipo 'open'.
  answers: { text: string; isCorrect: boolean }[];
}

interface QuizRow {
  id: string;
  unit_id: string;
  title: string;
  unit: { title: string; course_id: string; order: number } | null;
  questions: {
    id: string;
    prompt: string;
    type: QuestionType;
    order: number;
    answers: { id: string; answer_text: string; order: number; is_correct?: boolean }[];
  }[];
}

@Injectable({ providedIn: 'root' })
export class QuizzesService {
  private readonly supabase = inject(SupabaseClientService).client;

  async getUnitQuizSummary(unitId: string): Promise<{ id: string; title: string } | null> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .select('id, title')
      .eq('unit_id', unitId)
      .maybeSingle();

    if (error) throw error;
    return data ? { id: data['id'] as string, title: data['title'] as string } : null;
  }

  async getMyLastAttempt(quizId: string, userId: string): Promise<{ score: number | null } | null> {
    const { data, error } = await this.supabase
      .from('quiz_attempts')
      .select('score')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? { score: data['score'] as number | null } : null;
  }

  // Para que el alumno responda: nunca incluye is_correct de las respuestas.
  async getQuizForTaking(quizId: string): Promise<QuizDetail | null> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .select(
        `id, unit_id, title,
         unit:units ( title, course_id, order ),
         questions:quiz_questions ( id, prompt, type, order,
           answers:quiz_answers ( id, answer_text, order ) )`,
      )
      .eq('id', quizId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.toQuizDetail(data as unknown as QuizRow);
  }

  // Para docente/administrador editando el quiz: sí incluye is_correct.
  async getQuizForManage(quizId: string): Promise<QuizDetail | null> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .select(
        `id, unit_id, title,
         unit:units ( title, course_id, order ),
         questions:quiz_questions ( id, prompt, type, order,
           answers:quiz_answers ( id, answer_text, order, is_correct ) )`,
      )
      .eq('id', quizId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.toQuizDetail(data as unknown as QuizRow);
  }

  async createQuiz(unitId: string, title: string): Promise<{ id: string; title: string }> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .insert({ unit_id: unitId, title, status: 'published' })
      .select('id, title')
      .single();

    if (error) throw error;
    return { id: data['id'] as string, title: data['title'] as string };
  }

  async updateQuizTitle(quizId: string, title: string): Promise<void> {
    const { error } = await this.supabase.from('quizzes').update({ title }).eq('id', quizId);
    if (error) throw error;
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const { error } = await this.supabase.from('quizzes').delete().eq('id', quizId);
    if (error) throw error;
  }

  async createQuestion(quizId: string, nextOrder: number, input: QuizQuestionInput): Promise<QuizQuestion> {
    const { data: questionData, error: questionError } = await this.supabase
      .from('quiz_questions')
      .insert({ quiz_id: quizId, prompt: input.prompt, type: input.type, order: nextOrder })
      .select('id, prompt, type, order')
      .single();

    if (questionError) throw questionError;

    const questionId = questionData['id'] as string;
    const answers = await this.replaceAnswers(questionId, input);

    return {
      id: questionId,
      prompt: questionData['prompt'] as string,
      type: questionData['type'] as QuestionType,
      order: questionData['order'] as number,
      answers,
    };
  }

  async updateQuestion(questionId: string, input: QuizQuestionInput): Promise<QuizQuestion> {
    const { data: questionData, error: questionError } = await this.supabase
      .from('quiz_questions')
      .update({ prompt: input.prompt, type: input.type })
      .eq('id', questionId)
      .select('id, prompt, type, order')
      .single();

    if (questionError) throw questionError;

    const { error: deleteError } = await this.supabase.from('quiz_answers').delete().eq('question_id', questionId);
    if (deleteError) throw deleteError;

    const answers = await this.replaceAnswers(questionId, input);

    return {
      id: questionId,
      prompt: questionData['prompt'] as string,
      type: questionData['type'] as QuestionType,
      order: questionData['order'] as number,
      answers,
    };
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const { error } = await this.supabase.from('quiz_questions').delete().eq('id', questionId);
    if (error) throw error;
  }

  async submitAttempt(quizId: string, answers: QuizAttemptAnswerInput[]): Promise<number | null> {
    const { data, error } = await this.supabase.rpc('submit_quiz_attempt', {
      p_quiz_id: quizId,
      p_answers: answers,
    });

    if (error) throw error;
    return data as number | null;
  }

  async getAttempts(quizId: string): Promise<QuizAttemptSummary[]> {
    const { data, error } = await this.supabase
      .from('quiz_attempts')
      .select('id, user_id, score, answers, created_at, profile:profiles ( full_name )')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data as unknown as {
      id: string;
      user_id: string;
      score: number | null;
      answers: QuizAttemptAnswerInput[] | null;
      created_at: string;
      profile: { full_name: string | null } | null;
    }[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      studentName: row.profile?.full_name ?? 'Estudiante',
      score: row.score,
      createdAt: row.created_at,
      answers: row.answers ?? [],
    }));
  }

  private async replaceAnswers(
    questionId: string,
    input: QuizQuestionInput,
  ): Promise<QuizAnswerOption[]> {
    if (input.type === 'open' || input.answers.length === 0) return [];

    const rows = input.answers.map((answer, index) => ({
      question_id: questionId,
      answer_text: answer.text,
      is_correct: answer.isCorrect,
      order: index,
    }));

    const { data, error } = await this.supabase
      .from('quiz_answers')
      .insert(rows)
      .select('id, answer_text, order, is_correct');

    if (error) throw error;

    return (data as { id: string; answer_text: string; order: number; is_correct: boolean }[]).map((row) => ({
      id: row.id,
      text: row.answer_text,
      order: row.order,
      isCorrect: row.is_correct,
    }));
  }

  private toQuizDetail(row: QuizRow): QuizDetail {
    return {
      id: row.id,
      unitId: row.unit_id,
      unitTitle: row.unit?.title ?? '',
      unitOrder: row.unit?.order ?? 0,
      courseId: row.unit?.course_id ?? '',
      title: row.title,
      questions: [...row.questions]
        .sort((a, b) => a.order - b.order)
        .map((question) => ({
          id: question.id,
          prompt: question.prompt,
          type: question.type,
          order: question.order,
          answers: [...question.answers]
            .sort((a, b) => a.order - b.order)
            .map((answer) => ({
              id: answer.id,
              text: answer.answer_text,
              order: answer.order,
              ...(answer.is_correct !== undefined ? { isCorrect: answer.is_correct } : {}),
            })),
        })),
    };
  }
}
