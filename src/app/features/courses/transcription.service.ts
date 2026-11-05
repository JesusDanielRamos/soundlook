import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

export type TranscriptionSessionStatus = 'live' | 'ended';

export interface TranscriptionSessionSummary {
  id: string;
  title: string;
  status: TranscriptionSessionStatus;
  startedAt: string;
  endedAt: string | null;
  createdByName: string | null;
  lineCount: number;
}

export interface TranscriptionSession {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  status: TranscriptionSessionStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface TranscriptionLine {
  id: string;
  text: string;
  saidAt: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private readonly supabase = inject(SupabaseClientService).client;

  async listSessions(courseId: string): Promise<TranscriptionSessionSummary[]> {
    const { data, error } = await this.supabase
      .from('transcription_sessions')
      .select(
        `id, title, status, started_at, ended_at,
         creator:profiles ( full_name ),
         lines:transcription_lines ( id )`,
      )
      .eq('course_id', courseId)
      .order('started_at', { ascending: false });

    if (error) throw error;

    return (
      data as unknown as {
        id: string;
        title: string;
        status: TranscriptionSessionStatus;
        started_at: string;
        ended_at: string | null;
        creator: { full_name: string | null } | null;
        lines: { id: string }[];
      }[]
    ).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdByName: row.creator?.full_name ?? null,
      lineCount: row.lines.length,
    }));
  }

  async getSession(sessionId: string): Promise<TranscriptionSession | null> {
    const { data, error } = await this.supabase
      .from('transcription_sessions')
      .select('id, course_id, title, status, started_at, ended_at, course:courses ( title )')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as {
      id: string;
      course_id: string;
      title: string;
      status: TranscriptionSessionStatus;
      started_at: string;
      ended_at: string | null;
      course: { title: string } | null;
    };

    return {
      id: row.id,
      courseId: row.course_id,
      courseTitle: row.course?.title ?? '',
      title: row.title,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    };
  }

  async getLines(sessionId: string): Promise<TranscriptionLine[]> {
    const { data, error } = await this.supabase
      .from('transcription_lines')
      .select('id, text, said_at, order')
      .eq('session_id', sessionId)
      .order('order', { ascending: true });

    if (error) throw error;

    return (data as { id: string; text: string; said_at: string; order: number }[]).map((row) => ({
      id: row.id,
      text: row.text,
      saidAt: row.said_at,
      order: row.order,
    }));
  }

  async createSession(courseId: string, title: string): Promise<TranscriptionSession> {
    const userId = (await this.supabase.auth.getSession()).data.session?.user.id ?? null;

    const { data, error } = await this.supabase
      .from('transcription_sessions')
      .insert({ course_id: courseId, title, status: 'live', created_by: userId })
      .select('id, course_id, title, status, started_at, ended_at')
      .single();

    if (error) throw error;

    return {
      id: data['id'] as string,
      courseId: data['course_id'] as string,
      courseTitle: '',
      title: data['title'] as string,
      status: data['status'] as TranscriptionSessionStatus,
      startedAt: data['started_at'] as string,
      endedAt: data['ended_at'] as string | null,
    };
  }

  async addLine(sessionId: string, text: string, order: number): Promise<void> {
    const { error } = await this.supabase
      .from('transcription_lines')
      .insert({ session_id: sessionId, text, order });

    if (error) throw error;
  }

  async endSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('transcription_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const { error } = await this.supabase.from('transcription_sessions').update({ title }).eq('id', sessionId);
    if (error) throw error;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase.from('transcription_sessions').delete().eq('id', sessionId);
    if (error) throw error;
  }

  // Escucha nuevas líneas insertadas en vivo para esta sesión.
  subscribeToLines(sessionId: string, onInsert: (line: TranscriptionLine) => void): RealtimeChannel {
    return this.supabase
      .channel(`transcription-lines-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transcription_lines', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; text: string; said_at: string; order: number };
          onInsert({ id: row.id, text: row.text, saidAt: row.said_at, order: row.order });
        },
      )
      .subscribe();
  }

  // Escucha cuando el docente termina la sesión (status -> 'ended'), para
  // que los alumnos que la están viendo se enteren al instante.
  subscribeToSessionStatus(
    sessionId: string,
    onUpdate: (status: TranscriptionSessionStatus, endedAt: string | null) => void,
  ): RealtimeChannel {
    return this.supabase
      .channel(`transcription-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transcription_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { status: TranscriptionSessionStatus; ended_at: string | null };
          onUpdate(row.status, row.ended_at);
        },
      )
      .subscribe();
  }

  // Escucha cualquier cambio en las sesiones del curso (una nueva, una que
  // termina, título editado, eliminada) para refrescar la lista sin que
  // quien la esté viendo tenga que recargar la página.
  subscribeToCourseSessions(courseId: string, onChange: () => void): RealtimeChannel {
    return this.supabase
      .channel(`transcription-sessions-${courseId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transcription_sessions', filter: `course_id=eq.${courseId}` },
        () => onChange(),
      )
      .subscribe();
  }

  async unsubscribe(channel: RealtimeChannel): Promise<void> {
    await this.supabase.removeChannel(channel);
  }
}
