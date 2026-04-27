import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlContainer, NgForm } from '@angular/forms';

@Component({
  selector: 'app-initial-interaction-fields',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './initial-interaction-fields.component.html',
  styleUrls: ['./initial-interaction-fields.component.css'],
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }]
})
export class InitialInteractionFieldsComponent {
  @Input() process: any;
  @Output() processChange = new EventEmitter<any>();

  onChange() {
    this.processChange.emit(this.process);
  }
}
