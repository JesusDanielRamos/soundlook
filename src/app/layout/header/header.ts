import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isAuthenticated = computed(() => !!this.auth.session());
  readonly displayName = computed(
    () => this.auth.profile()?.fullName ?? this.auth.session()?.user.email ?? 'Mi cuenta',
  );

  // "Inicio" and "Acerca de" both route to '/', differing only by fragment,
  // so routerLinkActive alone can't tell them apart — track the fragment too.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly isAboutActive = computed(() => this.currentUrl().split('#')[1] === 'about');
  readonly isHomeActive = computed(() => {
    const [path] = this.currentUrl().split('#');
    return path === '/' && !this.isAboutActive();
  });

  readonly mobileMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  async signOut(): Promise<void> {
    this.closeUserMenu();
    this.closeMobileMenu();
    await this.auth.signOut();
    await this.router.navigate(['/']);
  }
}
