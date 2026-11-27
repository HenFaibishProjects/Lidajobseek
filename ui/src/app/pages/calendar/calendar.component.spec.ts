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

  it('identifies only the nearest upcoming interview', () => {
    component.interviews = [
      { id: 1, date: '2099-02-20T10:00:00.000Z' },
      { id: 2, date: '2099-02-10T10:00:00.000Z' },
      { id: 3, date: '2020-01-01T10:00:00.000Z' },
    ];

    expect(component.isNextInterview({ id: 2 })).toBeTrue();
    expect(component.isNextInterview({ id: 1 })).toBeFalse();
    expect(component.isNextInterview({ id: 3 })).toBeFalse();
  });
});

describe('CalendarComponent agenda navigation', () => {
  let calendar: CalendarComponent;

  beforeEach(() => {
    calendar = new CalendarComponent({} as any, {} as any, {} as any, {} as any, {} as any);
    spyOn(calendar, 'loadAvailability');
  });

  it('defaults to agenda and groups interviews in chronological day and time order', () => {
    calendar.interviews = [
      { id: 3, date: new Date(2099, 1, 11, 9).toISOString() },
      { id: 2, date: new Date(2099, 1, 10, 16).toISOString() },
      { id: 1, date: new Date(2099, 1, 10, 10).toISOString() },
    ];

    calendar.generateCalendar();

    expect(calendar.viewMode).toBe('list');
    expect(calendar.agendaGroups.map(group => group.interviews.map(interview => interview.id))).toEqual([[1, 2], [3]]);
  });

  it('selects a day with all interviews and availability blocks in both week and month', () => {
    const day = new Date(2099, 1, 10);
    calendar.currentWeekDate = calendar.currentMonthDate = day;
    calendar.interviews = [
      { id: 1, date: new Date(2099, 1, 10, 9).toISOString() },
      { id: 2, date: new Date(2099, 1, 10, 11).toISOString() },
    ];
    calendar.availabilityIntervals = [{
      source: 'MANUAL_BLOCK',
      recordId: 1,
      start: new Date(2099, 1, 10, 15).toISOString(),
      end: new Date(2099, 1, 10, 16).toISOString(),
      title: 'Recurring block',
      allDay: false,
      repeatWeekly: true,
    }];

    for (const view of ['week', 'month'] as const) {
      calendar.changeView(view);
      expect(calendar.selectedDay.date.toDateString()).toBe(day.toDateString());
      expect(calendar.selectedDay.interviews.length).toBe(2);
      expect(calendar.selectedDay.blocks.length).toBe(1);
    }
  });

  it('keeps the selected date inside the displayed period and Today reselects today', () => {
    calendar.changeView('week');
    calendar.nextWeek();
    expect(calendar.weekDays.some(day => day.date === calendar.selectedDay.date)).toBeTrue();
    calendar.todayWeek();
    expect(calendar.selectedDay.isToday).toBeTrue();

    calendar.changeView('month');
    calendar.prevMonth();
    expect(calendar.selectedDay.date.getMonth()).toBe(calendar.currentMonthDate.getMonth());
    calendar.todayMonth();
    expect(calendar.selectedDay.isToday).toBeTrue();
  });
});
