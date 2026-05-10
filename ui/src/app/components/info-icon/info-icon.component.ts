import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipDirective } from '../../directives/tooltip.directive';

@Component({
  selector: 'app-info-icon',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './info-icon.component.html',
  styleUrls: ['./info-icon.component.css']
})
export class InfoIconComponent {
  @Input() text: string = '';
  @Input() position: 'top' | 'bottom' | 'left' | 'right' = 'top';
}
