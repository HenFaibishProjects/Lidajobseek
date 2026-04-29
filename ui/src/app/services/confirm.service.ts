import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ConfirmButton {
  text: string;
  value: any;
  class?: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  buttons?: ConfirmButton[];
  danger?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private confirmSubject = new Subject<ConfirmOptions | null>();
  confirmState$ = this.confirmSubject.asObservable();

  private resultSubject = new Subject<any>();
  result$ = this.resultSubject.asObservable();

  confirm(message: string, title: string = 'Confirm Action'): Promise<boolean> {
    this.confirmSubject.next({
      message,
      title,
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });

    return new Promise((resolve) => {
      const sub = this.result$.subscribe((result) => {
        resolve(result);
        sub.unsubscribe();
        this.confirmSubject.next(null); // Close dialog
      });
    });
  }

  delete(itemName: string = 'this item'): Promise<boolean> {
    this.confirmSubject.next({
      title: 'Delete Permanently',
      message: `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Keep it',
      danger: true
    });

    return new Promise((resolve) => {
      const sub = this.result$.subscribe((result) => {
        resolve(result);
        sub.unsubscribe();
        this.confirmSubject.next(null);
      });
    });
  }

  custom(options: ConfirmOptions): Promise<any> {
    this.confirmSubject.next(options);

    return new Promise((resolve) => {
      const sub = this.result$.subscribe((result) => {
        resolve(result);
        sub.unsubscribe();
        this.confirmSubject.next(null); // Close dialog
      });
    });
  }

  resolve(result: any) {
    this.resultSubject.next(result);
  }
}
