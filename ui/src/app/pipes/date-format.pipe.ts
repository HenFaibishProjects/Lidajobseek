import { Pipe, PipeTransform } from '@angular/core';
import { SettingsService } from '../services/settings.service';

@Pipe({
  name: 'dateFormat',
  standalone: true,
})
export class DateFormatPipe implements PipeTransform {
  constructor(private settingsService: SettingsService) {}

  transform(value: string | Date | null | undefined, mode: 'date' | 'time' | 'datetime' = 'datetime'): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    if (mode === 'date') {
      return this.settingsService.formatDate(date);
    }

    if (mode === 'time') {
      return this.settingsService.formatTime(date);
    }

    return `${this.settingsService.formatDate(date)}, ${this.settingsService.formatTime(date)}`;
  }
}
