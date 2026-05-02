import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HeaderComponent } from './header.component';
import { RouterTestingModule } from '@angular/router/testing';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { By } from '@angular/platform-browser';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let router: Router;
  const routerEventsSubject = new Subject<any>();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent, RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    
    // Mock router events
    (router as any).events = routerEventsSubject.asObservable();

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have drawer closed by default', () => {
    expect(component.drawerOpen).toBeFalse();
  });

  it('should toggle drawer', () => {
    component.toggleDrawer();
    expect(component.drawerOpen).toBeTrue();
    component.toggleDrawer();
    expect(component.drawerOpen).toBeFalse();
  });

  it('should close drawer on navigation end', fakeAsync(() => {
    component.drawerOpen = true;
    routerEventsSubject.next(new NavigationEnd(1, '/', '/'));
    tick();
    expect(component.drawerOpen).toBeFalse();
  }));

  it('should close drawer when closeDrawer is called', () => {
    component.drawerOpen = true;
    component.closeDrawer();
    expect(component.drawerOpen).toBeFalse();
  });

  it('should close drawer on Escape key', () => {
    component.drawerOpen = true;
    component.onEscape();
    expect(component.drawerOpen).toBeFalse();
  });

  it('should emit toggleSettings when settings button is clicked', () => {
    component.isAuthenticated = true;
    fixture.detectChanges();
    spyOn(component.toggleSettings, 'emit');
    const settingsBtn = fixture.debugElement.query(By.css('.settings-btn'));
    settingsBtn.triggerEventHandler('click', null);
    expect(component.toggleSettings.emit).toHaveBeenCalled();
  });

  it('should emit logout when logout button is clicked', () => {
    component.isAuthenticated = true;
    fixture.detectChanges();
    spyOn(component.logout, 'emit');
    const logoutBtn = fixture.debugElement.query(By.css('.logout-btn'));
    logoutBtn.triggerEventHandler('click', null);
    expect(component.logout.emit).toHaveBeenCalled();
  });

  it('should show hamburger menu when authenticated', () => {
    component.isAuthenticated = true;
    fixture.detectChanges();
    const hamburger = fixture.debugElement.query(By.css('.hamburger-btn'));
    expect(hamburger).toBeTruthy();
  });

  it('should display the brand name Reqcue', () => {
    const brandElement = fixture.debugElement.query(By.css('.brand-name'));
    expect(brandElement.nativeElement.textContent).toContain('Reqcue');
  });
});
