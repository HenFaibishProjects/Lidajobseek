import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface TemplateVersion {
  label: string;
  content: string;
}

export interface Template {
  id: number;
  name: string;
  versions: TemplateVersion[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class TemplatesService {
  private readonly url = `${environment.apiUrl}/api/templates`;

  constructor(private http: HttpClient) {}

  getAll() { return this.http.get<Template[]>(this.url); }
  getById(id: number) { return this.http.get<Template>(`${this.url}/${id}`); }
  create(data: { name: string; versions: TemplateVersion[] }) { return this.http.post<Template>(this.url, data); }
  update(id: number, data: Partial<{ name: string; versions: TemplateVersion[] }>) { return this.http.patch<Template>(`${this.url}/${id}`, data); }
  delete(id: number) { return this.http.delete<void>(`${this.url}/${id}`); }
}
