import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AvailabilityService } from './availability.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InteractionsService {
    private apiUrl = `${environment.apiUrl}/api/interactions`;

    constructor(private http: HttpClient, public readonly availability: AvailabilityService) { }

    getAll(params?: { startDate?: string, endDate?: string, processId?: string }): Observable<any> {
        let httpParams = new HttpParams();

        if (params?.startDate) {
            httpParams = httpParams.set('startDate', params.startDate);
        }

        if (params?.endDate) {
            httpParams = httpParams.set('endDate', params.endDate);
        }

        if (params?.processId) {
            httpParams = httpParams.set('processId', params.processId);
        }

        return this.http.get(this.apiUrl, { params: httpParams });
    }

    create(data: any) {
        return this.availability.saveWithConflictConfirmation(override => this.http.post(this.apiUrl, { ...data, ...override }));
    }

    update(id: number, data: any) {
        return this.availability.saveWithConflictConfirmation(override => this.http.patch(`${this.apiUrl}/${id}`, { ...data, ...override }));
    }

    getById(id: number) { return this.http.get<any>(`${this.apiUrl}/${id}`); }

    delete(id: number) {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    exportData() {
        return this.http.get<any[]>(`${this.apiUrl}/export`);
    }

    importData(interactions: any[], mode: 'overwrite' | 'append') {
        return this.http.post(`${this.apiUrl}/import`, { interactions, mode });
    }
}
