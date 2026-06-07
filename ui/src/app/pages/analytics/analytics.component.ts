import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcessesService } from '../../services/processes.service';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import Chart from 'chart.js/auto';

@Component({
    selector: 'app-analytics',
    standalone: true,
    imports: [CommonModule, FormsModule, DateFormatPipe],
    templateUrl: './analytics.component.html',
    styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('interactionChart') interactionChartRef!: ElementRef;
    @ViewChild('statusChart') statusChartRef!: ElementRef;
    @ViewChild('sourceChart') sourceChartRef!: ElementRef;
    @ViewChild('timelineChart') timelineChartRef!: ElementRef;

    stats: any = {
        total: 0,
        active: 0,
        offers: 0,
        interviewRate: 0,
        rejectionRate: 0,
        avgDaysInProcess: 0
    };

    daysRange = 30; // Default to 30 days for trend
    periodDays = 14; // Default period filter
    periodStats: any = {
        totalInteractions: 0,
        callsCount: 0,
        interviewsCount: 0,
        assessmentsCount: 0,
        othersCount: 0,
        recruitersList: []
    };

    funnelStats = {
        applied: 0,
        screened: 0,
        interviewed: 0,
        offered: 0,
        applyToScreenRate: 0,
        screenToInterviewRate: 0,
        interviewToOfferRate: 0
    };

    velocity = {
        thisWeekCount: 0,
        target: 5,
        percentage: 0
    };

    insights: any[] = [];
    showActiveOnly = true;

    private charts: { [key: string]: any } = {};
    private rawProcesses: any[] = [];
    private rawAgencies: any[] = [];
    private themeObserver?: MutationObserver;

    constructor(
        private processesService: ProcessesService,
        private agenciesService: RecruitmentAgenciesService
    ) { }

    ngOnInit() {
        this.processesService.getAll().subscribe(processes => {
            this.rawProcesses = processes;
            this.agenciesService.getAll().subscribe(agencies => {
                this.rawAgencies = agencies;
                this.calculateStats();
                this.calculatePeriodStats();
                this.calculatePremiumStats();
                this.initCharts();
            });
        });
    }

    ngAfterViewInit() {
        this.themeObserver = new MutationObserver(() => {
            this.rebuildCharts();
        });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    ngOnDestroy() {
        if (this.themeObserver) {
            this.themeObserver.disconnect();
        }
    }

    toggleActiveStages() {
        this.showActiveOnly = !this.showActiveOnly;
        this.createStatusChart();
    }

    rebuildCharts() {
        if (!this.interactionChartRef) return;
        this.createStatusChart();
        this.createSourceChart();
        this.createTimelineChart();
        this.updateTrendChart();
    }

    getThemeColors() {
        const isDark = document.body.classList.contains('dark-theme');
        return {
            text: isDark ? '#94a3b8' : '#475569',
            grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            border: isDark ? '#334155' : '#e2e8f0'
        };
    }

    onRangeChange() {
        this.updateTrendChart();
    }

    onPeriodChange() {
        this.calculatePeriodStats();
    }

    calculatePeriodStats() {
        const now = new Date();
        const cutoffDate = new Date();
        cutoffDate.setDate(now.getDate() - this.periodDays);

        let total = 0;
        let calls = 0;
        let interviews = 0;
        let assessments = 0;
        let others = 0;

        // Process Interactions in this period
        this.rawProcesses.forEach(p => {
            if (p.interactions) {
                p.interactions.forEach((inter: any) => {
                    const interDate = new Date(inter.date);
                    if (interDate >= cutoffDate && interDate <= now) {
                        total++;
                        const type = inter.interviewType;
                        if (type === 'phone_screen' || type === 'coffee_chat') {
                            calls++;
                        } else if (['virtual_video', 'onsite', 'panel', 'behavioral', 'hiring_manager', 'executive', 'team_meet'].includes(type)) {
                            interviews++;
                        } else if (['tech_assessment', 'take_home', 'live_coding', 'system_design', 'case_study', 'portfolio', 'presentation'].includes(type)) {
                            assessments++;
                        } else {
                            others++;
                        }
                    }
                });
            }
        });

        // Agency Interactions in this period
        this.rawAgencies.forEach(agency => {
            if (agency.interactions) {
                agency.interactions.forEach((inter: any) => {
                    const interDate = new Date(inter.interactionDate);
                    if (interDate >= cutoffDate && interDate <= now) {
                        total++;
                        const type = (inter.interactionType || '').toUpperCase();
                        if (type === 'PHONE_CALL' || type === 'WHATSAPP') {
                            calls++;
                        } else if (type === 'EMAIL' || type === 'LINKEDIN') {
                            others++;
                        } else {
                            others++;
                        }
                    }
                });
            }
        });

        this.periodStats.totalInteractions = total;
        this.periodStats.callsCount = calls;
        this.periodStats.interviewsCount = interviews;
        this.periodStats.assessmentsCount = assessments;
        this.periodStats.othersCount = others;

        // Recruiters statistics
        const recruiters: any[] = [];
        this.rawAgencies.forEach(agency => {
            if (agency.contacts) {
                agency.contacts.forEach((contact: any) => {
                    const contactInteractions = (agency.interactions || []).filter(
                        (i: any) => i.contactId === contact.id
                    );

                    const periodInters = contactInteractions.filter((i: any) => {
                        const d = new Date(i.interactionDate);
                        return d >= cutoffDate && d <= now;
                    });

                    const sortedInters = [...contactInteractions].sort(
                        (a, b) => new Date(b.interactionDate).getTime() - new Date(a.interactionDate).getTime()
                    );
                    const lastInteraction = sortedInters[0] || null;

                    recruiters.push({
                        id: contact.id,
                        fullName: contact.fullName,
                        roleTitle: contact.roleTitle || 'Recruiter',
                        agencyName: agency.agencyName,
                        periodCount: periodInters.length,
                        lastSpokenDate: lastInteraction ? new Date(lastInteraction.interactionDate) : null,
                        lastSpokenSummary: lastInteraction ? lastInteraction.summary : null
                    });
                });
            }
        });

        recruiters.sort((a, b) => {
            if (b.periodCount !== a.periodCount) {
                return b.periodCount - a.periodCount;
            }
            if (a.lastSpokenDate && b.lastSpokenDate) {
                return b.lastSpokenDate.getTime() - a.lastSpokenDate.getTime();
            }
            return a.lastSpokenDate ? -1 : 1;
        });

        this.periodStats.recruitersList = recruiters;
    }

    calculateStats() {
        const total = this.rawProcesses.length;
        if (total === 0) return;

        const p = this.rawProcesses;

        this.stats.total = total;
        this.stats.active = p.filter(x => ['Initial Call Scheduled', 'Interview Scheduled', 'Home Task Assigned', 'Final HR Interview Scheduled'].includes(x.currentStage)).length;
        this.stats.offers = p.filter(x => x.currentStage === 'Offer' || x.currentStage === 'Signed').length;

        // Calculate Interview Rate (Processes that passed initial stage)
        const interviewed = p.filter(x => x.currentStage !== 'Applied' && x.currentStage !== 'No Response (14+ Days)').length;
        this.stats.interviewRate = Math.round((interviewed / total) * 100);

        this.stats.rejectionRate = Math.round((p.filter(x => x.currentStage === 'Rejected').length / total) * 100);

        // Avg days active (simple approx for now)
        const completed = p.filter(x => ['Rejected', 'Offer', 'Signed', 'Withdrawn'].includes(x.currentStage));
        if (completed.length > 0) {
            const totalDays = completed.reduce((acc, curr) => {
                const start = new Date(curr.createdAt);
                const end = new Date(curr.updatedAt);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return acc + diffDays;
            }, 0);
            this.stats.avgDaysInProcess = Math.round(totalDays / completed.length);
        }
    }

    initCharts() {
        if (!this.interactionChartRef) return; // Guard clause

        this.createStatusChart();
        this.createSourceChart();
        this.createTimelineChart(); // Applications over time
        this.updateTrendChart(); // Interaction activity
    }

    createStatusChart() {
        if (this.charts['status']) {
            this.charts['status'].destroy();
        }

        const colors = this.getThemeColors();
        const counts: { [key: string]: number } = {};
        
        this.rawProcesses.forEach(p => {
            const isClosed = ['Rejected', 'Reject', 'Withdrawn', 'Offer Declined', 'No Response (14+ Days)', 'Ghosted'].includes(p.currentStage);
            if (this.showActiveOnly && isClosed) {
                return;
            }
            counts[p.currentStage] = (counts[p.currentStage] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const data = Object.values(counts);

        if (labels.length === 0) {
            labels.push('No Active Processes');
            data.push(0);
        }

        this.charts['status'] = new Chart(this.statusChartRef.nativeElement, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#6366f1', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#64748b'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right', 
                        labels: { 
                            font: { size: 11, family: 'Inter, system-ui' }, 
                            color: colors.text,
                            usePointStyle: true 
                        } 
                    }
                },
                cutout: '75%'
            }
        });
    }

    createSourceChart() {
        if (this.charts['source']) {
            this.charts['source'].destroy();
        }

        const colors = this.getThemeColors();
        const counts: { [key: string]: number } = {};
        this.rawProcesses.forEach(p => {
            const source = p.source || 'Unknown';
            counts[source] = (counts[source] || 0) + 1;
        });

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        this.charts['source'] = new Chart(this.sourceChartRef.nativeElement, {
            type: 'bar',
            data: {
                labels: sorted.map(x => x[0]),
                datasets: [{
                    label: 'Applications',
                    data: sorted.map(x => x[1]),
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    hoverBackgroundColor: '#6366f1',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false } 
                },
                scales: {
                    x: { 
                        grid: { color: colors.grid }, 
                        ticks: { color: colors.text, font: { family: 'Inter' }, stepSize: 1 } 
                    },
                    y: { 
                        grid: { display: false }, 
                        ticks: { color: colors.text, font: { family: 'Inter' } } 
                    }
                }
            }
        });
    }

    createTimelineChart() {
        if (this.charts['timeline']) {
            this.charts['timeline'].destroy();
        }

        const colors = this.getThemeColors();
        const months: string[] = [];
        const data: number[] = [];
        const today = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthLabel = d.toLocaleString('default', { month: 'short' });
            months.push(monthLabel);

            const count = this.rawProcesses.filter(p => {
                const pDate = new Date(p.createdAt);
                return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
            }).length;
            data.push(count);
        }

        this.charts['timeline'] = new Chart(this.timelineChartRef.nativeElement, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'New Applications',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)',
                    hoverBackgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false } 
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { color: colors.text, stepSize: 1 }, 
                        grid: { color: colors.grid } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: colors.text } 
                    }
                }
            }
        });
    }

    updateTrendChart() {
        if (this.charts['trend']) {
            this.charts['trend'].destroy();
        }

        const colors = this.getThemeColors();
        const allInteractions: any[] = [];
        this.rawProcesses.forEach(p => {
            if (p.interactions) allInteractions.push(...p.interactions);
        });

        const labels: string[] = [];
        const counts: number[] = [];

        for (let i = this.daysRange - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0];

            const count = allInteractions.filter(inter => {
                const interDate = new Date(inter.date).toISOString().split('T')[0];
                return interDate === dateString;
            }).length;

            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            labels.push(`${day}/${month}`);
            counts.push(count);
        }

        this.charts['trend'] = new Chart(this.interactionChartRef.nativeElement, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Activity',
                    data: counts,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 1,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { color: colors.text, stepSize: 1 }, 
                        grid: { color: colors.grid } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: colors.text, maxTicksLimit: 10 } 
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        });
    }

    calculatePremiumStats() {
        const p = this.rawProcesses;
        const total = p.length;
        if (total === 0) return;

        const applied = total;

        const reachedScreen = p.filter(x => {
            const hasScreenInteraction = x.interactions?.some((i: any) => i.interviewType === 'phone_screen');
            const hasPassedApplied = x.currentStage !== 'Applied' && x.currentStage !== 'No Response (14+ Days)';
            return hasScreenInteraction || hasPassedApplied;
        }).length;

        const reachedInterview = p.filter(x => {
            const hasInterviewInteraction = x.interactions?.some((i: any) => 
                ['virtual_video', 'onsite', 'panel', 'behavioral', 'hiring_manager', 'executive', 'team_meet', 'tech_assessment', 'take_home', 'live_coding', 'system_design'].includes(i.interviewType)
            );
            const hasPassedScreen = !['Applied', 'No Response (14+ Days)', 'Initial Call Scheduled'].includes(x.currentStage);
            return hasInterviewInteraction || hasPassedScreen;
        }).length;

        const reachedOffer = p.filter(x => ['Offer', 'Signed'].includes(x.currentStage)).length;

        this.funnelStats.applied = applied;
        this.funnelStats.screened = reachedScreen;
        this.funnelStats.interviewed = reachedInterview;
        this.funnelStats.offered = reachedOffer;

        this.funnelStats.applyToScreenRate = total > 0 ? Math.round((reachedScreen / total) * 100) : 0;
        this.funnelStats.screenToInterviewRate = reachedScreen > 0 ? Math.round((reachedInterview / reachedScreen) * 100) : 0;
        this.funnelStats.interviewToOfferRate = reachedInterview > 0 ? Math.round((reachedOffer / reachedInterview) * 100) : 0;

        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);

        const appsThisWeek = p.filter(x => {
            const created = new Date(x.createdAt);
            return created >= sevenDaysAgo && created <= now;
        }).length;

        this.velocity.thisWeekCount = appsThisWeek;
        this.velocity.percentage = Math.min(Math.round((appsThisWeek / this.velocity.target) * 100), 100);

        const list: any[] = [];

        const channelCounts: Record<string, { total: number; interviews: number }> = {};
        p.forEach(x => {
            const src = x.source || 'Other';
            if (!channelCounts[src]) {
                channelCounts[src] = { total: 0, interviews: 0 };
            }
            channelCounts[src].total++;
            const hasInterview = x.interactions?.some((i: any) => 
                !['phone_screen', 'coffee_chat'].includes(i.interviewType)
            );
            if (hasInterview || !['Applied', 'No Response (14+ Days)', 'Initial Call Scheduled'].includes(x.currentStage)) {
                channelCounts[src].interviews++;
            }
        });

        let bestChannel = '';
        let bestRate = 0;
        Object.entries(channelCounts).forEach(([src, stats]) => {
            if (stats.total >= 2) {
                const rate = stats.interviews / stats.total;
                if (rate > bestRate) {
                    bestRate = rate;
                    bestChannel = src;
                }
            }
        });

        if (bestChannel && bestRate > 0) {
            list.push({
                type: 'success',
                title: 'Top Recruiting Channel',
                description: `${bestChannel} is your highest-performing channel with a ${Math.round(bestRate * 100)}% conversion to interviews. Double down on applications there!`,
                icon: '🚀'
            });
        }

        const ghostedCount = p.filter(x => x.currentStage === 'No Response (14+ Days)').length;
        if (ghostedCount > 0) {
            const pct = Math.round((ghostedCount / total) * 100);
            list.push({
                type: 'warning',
                title: 'High No-Response Rate',
                description: `${ghostedCount} of your applications (${pct}%) have gone stale without a response. Consider revising your initial outreach messages or templates.`,
                icon: '⚠️'
            });
        }

        const staleFollowUps = p.filter(x => {
            const isStale = (now.getTime() - new Date(x.updatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
            const isActive = !['Rejected', 'Offer', 'Signed', 'Withdrawn', 'No Response (14+ Days)'].includes(x.currentStage);
            return isStale && isActive;
        });

        if (staleFollowUps.length > 0) {
            const names = staleFollowUps.slice(0, 2).map(x => x.companyName).join(', ');
            const suffix = staleFollowUps.length > 2 ? ` and ${staleFollowUps.length - 2} others` : '';
            list.push({
                type: 'info',
                title: 'Stale Active Applications',
                description: `You have ${staleFollowUps.length} active processes (e.g. ${names}${suffix}) with no updates for over 7 days. It might be time to send a follow-up.`,
                icon: '✉️'
            });
        }

        if (list.length < 2) {
            list.push({
                type: 'info',
                title: 'Job Search Velocity',
                description: `You applied to ${appsThisWeek} roles this week. Consistency is key to unlocking new interview opportunities.`,
                icon: '📅'
            });
        }

        this.insights = list;
    }
}
