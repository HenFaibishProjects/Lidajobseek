import { ApplicationConfig, provideZoneChangeDetection, LOCALE_ID, importProvidersFrom } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { registerLocaleData } from '@angular/common';
import localeEnGb from '@angular/common/locales/en-GB';
import {
  Pencil, Trash2, Edit, CheckCircle2, AlertCircle, Calendar, FileText, Circle,
  Download, Upload, Plus, Star, Phone, MapPin, Briefcase, MessageCircle, X,
  Search, Filter, LayoutGrid, List, Sparkles, Info
} from 'lucide-angular';
import { provideLucideIcons } from './lucide-provider';

registerLocaleData(localeEnGb);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: LOCALE_ID, useValue: 'en-GB' },
    provideLucideIcons({
      Pencil, Trash2, Edit, CheckCircle2, AlertCircle, Calendar, FileText, Circle,
      Download, Upload, Plus, Star, Phone, MapPin, Briefcase, MessageCircle, X,
      Search, Filter, LayoutGrid, List, Sparkles, Info
    })
  ]
};
