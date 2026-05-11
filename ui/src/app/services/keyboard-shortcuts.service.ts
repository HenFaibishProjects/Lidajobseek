import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ToastService } from './toast.service';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService implements OnDestroy {
  private shortcuts: KeyboardShortcut[] = [];
  private shortcutTriggered = new Subject<string>();

  shortcutTriggered$ = this.shortcutTriggered.asObservable();
  private keydownListener?: (event: KeyboardEvent) => void;

  constructor(
    private router: Router,
    private toastService: ToastService
  ) {
    this.initializeDefaultShortcuts();
    this.setupEventListener();
  }

  private initializeDefaultShortcuts() {
    this.registerShortcut({
      key: 'd',
      description: 'Go to Dashboard',
      action: () => this.router.navigate(['/'])
    });

    this.registerShortcut({
      key: 'p',
      description: 'Go to Pipeline',
      action: () => this.router.navigate(['/pipeline'])
    });

    this.registerShortcut({
      key: 'c',
      description: 'Go to Calendar',
      action: () => this.router.navigate(['/calendar'])
    });

    this.registerShortcut({
      key: 'a',
      description: 'Go to Analytics',
      action: () => this.router.navigate(['/analytics'])
    });

    this.registerShortcut({
      key: 'h',
      description: 'Go to Coach Hub',
      action: () => this.router.navigate(['/coach-hub'])
    });

    this.registerShortcut({
      key: '/',
      description: 'Focus Search',
      action: () => {
        const searchInput = document.querySelector<HTMLInputElement>('.search-input');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    });
  }

  registerShortcut(shortcut: KeyboardShortcut) {
    this.shortcuts.push(shortcut);
  }

  private setupEventListener() {
    this.keydownListener = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const matchingShortcut = this.shortcuts.find(shortcut => {
        const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase();
        const ctrlMatch = (shortcut.ctrl ?? false) === (event.ctrlKey || event.metaKey);
        const altMatch = (shortcut.alt ?? false) === event.altKey;
        const shiftMatch = (shortcut.shift ?? false) === event.shiftKey;

        return keyMatch && ctrlMatch && altMatch && shiftMatch;
      });

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
        this.shortcutTriggered.next(matchingShortcut.description);
        this.toastService.show(`Shortcut: ${matchingShortcut.description}`, 'success');
      }
    };

    document.addEventListener('keydown', this.keydownListener);
  }

  ngOnDestroy() {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener);
    }
  }

  getShortcuts(): KeyboardShortcut[] {
    return this.shortcuts;
  }

  getShortcutDisplay(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
  }
}
