import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
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
