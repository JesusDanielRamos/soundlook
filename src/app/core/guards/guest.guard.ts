import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Lo opuesto de authGuard: si ya hay sesión activa, no tiene sentido mostrar
// la home pública ni los formularios de login/registro — se manda directo
// al panel.
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.session() ? router.parseUrl('/dashboard') : true;
};
