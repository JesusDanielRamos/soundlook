import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  // Purely visual state for now — wiring to AuthService.signIn() comes later.
  protected readonly showPassword = signal(false);

  togglePasswordVisibility(): void {
    this.showPassword.update((show) => !show);
  }
}
