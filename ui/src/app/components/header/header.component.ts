import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  @Input() isAuthenticated: boolean = false;
  @Input() showSettings: boolean = false;
  @Output() toggleSettings = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  drawerOpen = false;

  constructor(private router: Router) {
    // Close drawer on any navigation
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen = false);
  }

  toggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
  }

  closeDrawer() {
    this.drawerOpen = false;
  }

  // Close drawer on Escape key
  @HostListener('document:keydown.escape')
  onEscape() {
    this.drawerOpen = false;
  }
}