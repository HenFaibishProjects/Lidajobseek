import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { SettingsPanelComponent } from './components/settings-panel/settings-panel.component';
import { ScrollToTopComponent } from './components/scroll-to-top/scroll-to-top.component';
import { HeaderComponent } from './components/header/header.component';
import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { CareerChatPanelComponent } from './components/career-chat-panel/career-chat-panel.component';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ToastService } from './services/toast.service';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, ToastComponent, ConfirmDialogComponent, SettingsPanelComponent, ScrollToTopComponent, HeaderComponent, OnboardingComponent, CareerChatPanelComponent, LucideAngularModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Reqcue';
  showSettings = false;
  showCareerChat = false;

  get showOnboarding(): boolean {
    return this.isAuthenticated && !this.settingsService.getSettings().hasSeenOnboarding;
  }

  constructor(
    private authService: AuthService,
    private settingsService: SettingsService,
    private toastService: ToastService,
    private keyboardShortcutsService: KeyboardShortcutsService
  ) { }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  ngOnInit() {
    // Settings service will handle theme initialization
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  closeSettings() {
    this.showSettings = false;
  }

  closeOnboarding() {
    this.settingsService.updateSettings({ hasSeenOnboarding: true });
  }

  toggleCareerChat() {
    this.showCareerChat = !this.showCareerChat;
  }

  logout() {
    this.authService.logout();
  }
}