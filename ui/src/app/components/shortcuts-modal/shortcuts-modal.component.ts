import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

@Component({
  selector: 'app-shortcuts-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shortcuts-modal.component.html',
  styleUrls: ['./shortcuts-modal.component.css']
})
export class ShortcutsModalComponent {
  @Output() close = new EventEmitter<void>();
  shortcuts: any[] = [];

  constructor(private keyboardService: KeyboardShortcutsService) {
    this.shortcuts = this.keyboardService.getShortcuts();
  }

  onClose() {
    this.close.emit();
  }
}
