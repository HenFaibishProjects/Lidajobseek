import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgencyContactsService {
  private readonly url = `${environment.apiUrl}/api/agency-contacts`;

  constructor(private http: HttpClient) {}

  create(data: any) { return this.http.post<any>(this.url, data); }
  update(id: number, data: any) { return this.http.patch<any>(`${this.url}/${id}`, data); }
  delete(id: number) { return this.http.delete<any>(`${this.url}/${id}`); }
}
