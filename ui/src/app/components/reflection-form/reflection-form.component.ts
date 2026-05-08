import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-reflection-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reflection-form.component.html',
    styleUrl: './reflection-form.component.css'
})
export class ReflectionFormComponent {
    /** The reflection object is mutated directly in-place (passed by reference from the parent). */
    @Input() reflection: any = {};

    /** Optional section number badge -defaults to 5 */
    @Input() sectionNumber: number = 5;

    moods = [
        { key: 'great', emoji: '🚀', label: 'On fire' },
        { key: 'good', emoji: '😊', label: 'Good' },
        { key: 'neutral', emoji: '😐', label: 'Neutral' },
        { key: 'tough', emoji: '😓', label: 'Tough' },
        { key: 'rough', emoji: '😞', label: 'Rough' },
    ];

    readonly confidenceLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

    setConfidence(n: number) { this.reflection.confidence = n; }

    toggleMood(key: string) {
        this.reflection.mood = this.reflection.mood === key ? '' : key;
    }
}
