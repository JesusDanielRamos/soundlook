import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

// Intentos fallidos seguidos permitidos antes de bloquear el formulario un rato.
// Es una mitigación de fuerza bruta del lado del cliente: no sustituye el
// rate limiting de Supabase, pero evita que un script (o un usuario frustrado)
// dispare peticiones sin control desde el propio formulario.
const MAX_INTENTOS_FALLIDOS = 5;
const DURACION_BLOQUEO_MS = 30_000;

@Component({
  selector: 'app-login',
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showPassword = signal(false);

  // Modelo del formulario (ngModel de FormsModule).
  protected readonly email = signal('');
  protected readonly password = signal('');

  // Estado de la petición en curso: sirve para deshabilitar el botón y evitar
  // que el usuario dispare varios submits mientras esperamos respuesta.
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // Caso particular: credenciales correctas pero cuenta sin confirmar por
  // correo. No es lo mismo que "credenciales inválidas", así que lo tratamos
  // aparte para poder ofrecer un botón de reenvío en vez del error genérico.
  protected readonly emailSinConfirmar = signal(false);
  protected readonly reenviando = signal(false);
  protected readonly reenvioExitoso = signal(false);

  // --- Bloqueo temporal tras intentos fallidos ---
  private intentosFallidos = 0;
  protected readonly bloqueadoHasta = signal<number | null>(null);
  protected readonly segundosRestantes = signal(0);
  private temporizador?: ReturnType<typeof setInterval>;

  protected get formularioBloqueado(): boolean {
    return this.bloqueadoHasta() !== null;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((show) => !show);
  }

  async onSubmit(form: NgForm): Promise<void> {
    this.errorMessage.set(null);
    this.emailSinConfirmar.set(false);
    this.reenvioExitoso.set(false);

    // Triple candado antes de tocar la red:
    // 1) el formulario es inválido (correo mal formado, campos vacíos, etc.)
    // 2) ya hay una petición en curso
    // 3) el usuario está en periodo de bloqueo por intentos fallidos
    if (form.invalid || this.loading() || this.formularioBloqueado) {
      return;
    }

    // Normalizamos el correo (Supabase lo hace también, pero evita variaciones
    // como espacios o mayúsculas que generarían "intentos fallidos" falsos).
    const email = this.email().trim().toLowerCase();
    const password = this.password();

    this.loading.set(true);

    try {
      await this.auth.signIn(email, password);
      this.intentosFallidos = 0;
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      if (this.esErrorEmailSinConfirmar(error)) {
        // Este caso sí se puede explicar con detalle: para llegar aquí Supabase
        // ya validó que el correo y la contraseña son correctos, así que no
        // estamos revelando nada que un atacante no supiera ya con esas
        // credenciales en la mano.
        this.errorMessage.set(
          'Tu correo aún no está confirmado. Revisa tu bandeja de entrada (o spam).',
        );
        this.emailSinConfirmar.set(true);
      } else {
        // Mensaje genérico a propósito: si dijéramos "el correo no existe" o
        // "contraseña incorrecta" por separado, cualquiera podría usar el login
        // para averiguar qué correos están registrados (enumeración de cuentas).
        this.errorMessage.set('Correo o contraseña incorrectos.');
        this.registrarIntentoFallido();
      }
    } finally {
      this.loading.set(false);
    }
  }

  async reenviarConfirmacion(): Promise<void> {
    if (this.reenviando()) return;

    this.reenviando.set(true);
    try {
      await this.auth.resendConfirmationEmail(this.email().trim().toLowerCase());
      this.reenvioExitoso.set(true);
    } catch {
      this.errorMessage.set('No se pudo reenviar el correo. Intenta de nuevo en unos minutos.');
    } finally {
      this.reenviando.set(false);
    }
  }

  private esErrorEmailSinConfirmar(error: unknown): boolean {
    const codigo = (error as { code?: string })?.code;
    const mensaje = error instanceof Error ? error.message.toLowerCase() : '';
    return codigo === 'email_not_confirmed' || mensaje.includes('email not confirmed');
  }

  private registrarIntentoFallido(): void {
    this.intentosFallidos++;

    if (this.intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
      this.iniciarBloqueoTemporal();
    }
  }

  private iniciarBloqueoTemporal(): void {
    this.bloqueadoHasta.set(Date.now() + DURACION_BLOQUEO_MS);
    this.actualizarSegundosRestantes();

    clearInterval(this.temporizador);
    this.temporizador = setInterval(() => this.actualizarSegundosRestantes(), 1000);
  }

  private actualizarSegundosRestantes(): void {
    const hasta = this.bloqueadoHasta();
    if (hasta === null) return;

    const restante = Math.max(0, Math.ceil((hasta - Date.now()) / 1000));
    this.segundosRestantes.set(restante);

    if (restante === 0) {
      this.bloqueadoHasta.set(null);
      this.intentosFallidos = 0;
      clearInterval(this.temporizador);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }
}
