import { Routes } from '@angular/router';

export const QUIZZES_ROUTES: Routes = [
  {
    path: ':id',
    loadComponent: () => import('./quiz-detail/quiz-detail').then((m) => m.QuizDetail),
  },
  {
    path: ':id/resultado',
    loadComponent: () => import('./quiz-result/quiz-result').then((m) => m.QuizResult),
  },
];
