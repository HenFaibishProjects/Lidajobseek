import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-scroll-to-top',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scroll-to-top.component.html',
  styleUrls: ['./scroll-to-top.component.css']
})
export class ScrollToTopComponent {
  isVisible = false;

  @HostListener('window:scroll')
  onWindowScroll() {
    this.isVisible = window.pageYOffset > 300;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    // Ctrl + Up Arrow to scroll to top
    if (event.ctrlKey && event.key === 'ArrowUp') {
      event.preventDefault();
      this.scrollToTop();
    }
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}
