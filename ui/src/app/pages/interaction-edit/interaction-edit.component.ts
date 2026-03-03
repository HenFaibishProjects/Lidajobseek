import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
    selector: 'app-interaction-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
    templateUrl: './interaction-edit.component.html',
    styleUrls: ['./interaction-edit.component.css']
})
export class InteractionEditComponent implements OnInit {
    interaction: any;
    processId!: number;
    availableRoles = ['HR', 'Tech Lead', 'Team Member', 'Team Lead', 'Manager', 'CTO', 'Director', 'Group Leader', 'Architect'];
    datePart: string = '';
    timePart: string = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private interactionsService: InteractionsService,
        private processesService: ProcessesService
    ) { }

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('pid'));
        const id = Number(this.route.snapshot.paramMap.get('id'));

        // We can't easily get a single interaction by ID from the API yet,
        // so we fetch the whole process and find it.
        // Or we add a Get by ID for interactions.
        // Let's just fetch it from the process for now.
        this.processesService.getById(this.processId).subscribe(data => {
            const inter = data.interactions.find((i: any) => i.id === id);
            if (inter) {
                this.interaction = { ...inter };
                // Prepare local date/time controls
                const d = new Date(this.interaction.date);
                const tzOffset = d.getTimezoneOffset() * 60000;
                const localIso = new Date(d.getTime() - tzOffset).toISOString();
                this.datePart = localIso.slice(0, 10);
                this.timePart = localIso.slice(11, 16);
                this.interaction.date = `${this.datePart}T${this.timePart}`;
            }
        });
    }

    updateDateTime() {
        if (this.datePart && this.timePart) {
            this.interaction.date = `${this.datePart}T${this.timePart}`;
        }
    }

    addParticipant() {
        this.interaction.participants.push({ role: 'HR', name: '' });
    }

    removeParticipant(index: number) {
        this.interaction.participants.splice(index, 1);
    }

    onSubmit() {
        const payload = { ...this.interaction };
        payload.date = new Date(this.interaction.date).toISOString();

        this.interactionsService.update(this.interaction.id, payload).subscribe(() => {
            this.router.navigate(['/process', this.processId]);
        });
    }
}
