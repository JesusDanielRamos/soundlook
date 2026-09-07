import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseListItem, CoursesService } from '../courses.service';

@Component({
  selector: 'app-course-list',
  imports: [RouterLink],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList {
  private readonly coursesService = inject(CoursesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly courses = signal<CourseListItem[]>([]);

  constructor() {
    void this.loadCourses();
  }

  private async loadCourses(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.courses.set(await this.coursesService.listCourses());
    } catch {
      this.error.set('No pudimos cargar los cursos. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
