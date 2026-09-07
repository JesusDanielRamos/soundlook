import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideTaiga, TUI_DARK_MODE, TUI_DARK_MODE_KEY } from '@taiga-ui/core';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideAnimationsAsync(),
    provideTaiga(),
    provideAppInitializer(() => inject(AuthService).init()),
    // Por default, Taiga UI sigue el prefers-color-scheme del sistema. En
    // Soundlook queremos arrancar siempre en modo día mientras el usuario no
    // haya elegido explícitamente un tema (el toggle del header sí persiste).
    provideAppInitializer(() => {
      const key = inject(TUI_DARK_MODE_KEY);
      if (localStorage.getItem(key) === null) {
        inject(TUI_DARK_MODE).set(false);
      }
    }),
  ],
};
