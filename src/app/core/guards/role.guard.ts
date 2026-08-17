import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../models/user-role.model';

/**
 * UX-only gate: hides routes a role shouldn't see. Real enforcement lives in
 * Supabase RLS policies — this guard never substitutes for them.
 */
export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const profile = auth.profile();
    return profile && allowedRoles.includes(profile.role) ? true : router.parseUrl('/dashboard');
  };
};
