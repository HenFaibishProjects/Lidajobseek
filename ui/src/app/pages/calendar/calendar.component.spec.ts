import { CalendarComponent } from './calendar.component';

describe('CalendarComponent duration formatting', () => {
  const component = new CalendarComponent(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('uses friendly labels for half an hour and one hour', () => {
    expect(component.formatDuration(30)).toBe('Half an hour');
    expect(component.formatDuration(60)).toBe('One hour');
  });

  it('keeps shorter durations in minutes', () => {
    expect(component.formatDuration(45)).toBe('45 minutes');
  });

  it('splits durations longer than an hour into hours and minutes', () => {
    expect(component.formatDuration(75)).toBe('One hour and 15 minutes');
    expect(component.formatDuration(120)).toBe('2 hours');
    expect(component.formatDuration(121)).toBe('2 hours and 1 minute');
  });
});
