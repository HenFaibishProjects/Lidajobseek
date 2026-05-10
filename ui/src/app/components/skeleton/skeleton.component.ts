import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton.component.html',
  styleUrls: ['./skeleton.component.css']
})
export class SkeletonComponent {
  @Input() type: 'text' | 'title' | 'avatar' | 'button' | 'card' = 'text';
  @Input() width: string = '100%';
  @Input() height: string = '';
}
