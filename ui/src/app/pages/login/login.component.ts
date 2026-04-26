import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  styles: [`
    .hint-text {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 8px;
    }
    .link-text {
      color: var(--accent-color);
      text-decoration: underline;
      cursor: pointer;
    }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  name = '';
  isRegister = false;
  verificationCode = '';
  error = '';
  showVerificationModal = false;
  verificationPrompt = '';
  socialProvider: 'facebook' | 'linkedin' | 'google' | 'register' | null = null;
  socialVerificationCode = '';
  pendingRegisterToggle = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private settingsService: SettingsService,
  ) { }

  toggleMode() {
    if (!this.isRegister) {
      this.pendingRegisterToggle = true;
      this.openVerificationModal('register');
      return;
    }

    this.isRegister = false;
    this.error = '';
    this.name = '';
    this.password = '';
    this.verificationCode = '';
    this.closeVerificationModal();
  }

  openVerificationModal(provider: 'facebook' | 'linkedin' | 'google' | 'register') {
    this.socialProvider = provider;
    this.socialVerificationCode = '';
    this.verificationPrompt = '';
    this.showVerificationModal = true;
  }

  closeVerificationModal() {
    this.showVerificationModal = false;
    this.verificationPrompt = '';
    this.socialProvider = null;
    this.socialVerificationCode = '';
    this.pendingRegisterToggle = false;
  }

  submitSocialVerification() {
    if (!this.socialVerificationCode.trim()) {
      this.verificationPrompt = 'Verification code is required to proceed.';
      return;
    }

    this.authService.verifyInvitationCode(this.socialVerificationCode.trim()).subscribe({
      next: () => {
        if (this.pendingRegisterToggle) {
          this.isRegister = true;
          this.verificationCode = this.socialVerificationCode.trim();
          this.toastService.show('Verification confirmed. You can create your account now.', 'success');
          this.closeVerificationModal();
          return;
        }

        const providerName = this.socialProvider ? this.socialProvider.toUpperCase() : 'SOCIAL';
        this.toastService.show(`${providerName} verification confirmed. Continue with sign-in.`, 'success');
        this.closeVerificationModal();
      },
      error: (err) => {
        this.verificationPrompt = err.error?.message || 'Invalid verification code.';
      }
    });
  }

  submit() {
    this.error = '';
    if (this.isRegister) {
      if (!this.email || !this.password || !this.name || !this.verificationCode) {
        this.error = 'Please fill all fields including verification code';
        return;
      }
      this.authService.register(this.email, this.password, this.name, this.verificationCode).subscribe({
        next: () => {
          this.isRegister = false;
          this.toastService.show('Registration successful! Please login.', 'success');
          this.error = '';
        },
        error: (err) => {
          this.error = err.error?.message || 'Registration failed. Try again.';
        }
      });
    } else {
      if (!this.email || !this.password) {
        this.error = 'Please enter email and password';
        return;
      }
      this.authService.login(this.email, this.password).subscribe({
        next: () => {
          this.settingsService.hydrateFromStoredUser();
          this.settingsService.syncWithServer();
          this.router.navigate(['/']);
        },
        error: () => {
          this.error = 'Invalid credentials';
        }
      });
    }
  }
}
