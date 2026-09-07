import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CourseWithUnits, CoursesService } from '../courses.service';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly coursesService = inject(CoursesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly course = signal<CourseWithUnits | null>(null);

  constructor() {
    void this.loadCourse();
  }

  private async loadCourse(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      this.error.set('Curso no encontrado.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.course.set(await this.coursesService.getCourse(id));
    } catch {
      this.error.set('No pudimos cargar este curso. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
