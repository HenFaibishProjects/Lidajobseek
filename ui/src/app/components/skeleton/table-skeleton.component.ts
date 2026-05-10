import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-table-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  templateUrl: './table-skeleton.component.html',
  styleUrls: ['./table-skeleton.component.css']
})
export class TableSkeletonComponent {
  @Input() rows: number = 5;
  @Input() columns: Array<{width?: string, type?: string, height?: string}> = [
    { width: '200px' },
    { width: '150px' },
    { width: '120px' },
    { width: '100px' },
    { width: '80px' }
  ];

  get rowsArray() {
    return Array(this.rows).fill(0);
  }

  getSkeletonType(type?: string): 'text' | 'title' | 'avatar' | 'button' | 'card' {
    const validTypes: ('text' | 'title' | 'avatar' | 'button' | 'card')[] = ['text', 'title', 'avatar', 'button', 'card'];
    return validTypes.includes(type as any) ? type as any : 'text';
  }
}
