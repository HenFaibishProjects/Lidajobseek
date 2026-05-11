import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourcesService } from '../../services/resources.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';
import { FilterPipe } from '../../pipes/filter.pipe';
import { environment } from '../../../environments/environment';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GoogleDriveService } from '../../services/google-drive.service';

interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
    enabled: boolean;
    isEditing?: boolean;
}

import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
    selector: 'app-coach-hub',
    standalone: true,
    imports: [CommonModule, FormsModule, FilterPipe, DateFormatPipe],
    templateUrl: './coach-hub.component.html',
    styleUrl: './coach-hub.component.css'
})
export class CoachHubComponent implements OnInit {
    resources: any[] = [];
    selectedCategory: string | null = null;
    showForm: boolean = false;
    showConfig: boolean = false;
    selectedFileName: string = '';
    selectedFile: File | null = null;
    showAddCategory: boolean = false;
    googleDriveId: string = '';
    googleClientId: string = '';
    showDriveViewer: boolean = false;
    safeDriveUrl: SafeResourceUrl | null = null;
    isGoogleAuthenticated: boolean = false;
    driveFiles: any[] = [];
    loadingDrive: boolean = false;

    newResource: any = {
        title: '',
        type: 'CV',
        content: '',
        tags: ''
    };

    newCategory: Category = {
        id: '',
        name: '',
        icon: '📁',
        color: '#6366f1',
        enabled: true
    };

    availableIcons = ['📄', '❓', '🎤', '📝', '📁', '💼', '🎯', '📊', '🔖', '⭐', '🚀', '💡'];
    availableColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#14b8a6'];

    categories: Category[] = [
        { id: 'CV', name: 'CV / Resume', icon: '📄', color: '#3b82f6', enabled: true },
        { id: 'Questions', name: 'Interview Questions', icon: '❓', color: '#8b5cf6', enabled: true },
        { id: 'Pitch', name: 'Elevator Pitch', icon: '🎤', color: '#ec4899', enabled: false },
        { id: 'Note', name: 'Notes', icon: '📝', color: '#f59e0b', enabled: false },
        { id: 'File', name: 'Documents', icon: '📁', color: '#10b981', enabled: false }
    ];

    constructor(
        private resourcesService: ResourcesService,
        private confirmService: ConfirmService,
        private toastService: ToastService,
        private authService: AuthService,
        private sanitizer: DomSanitizer,
        private googleDriveService: GoogleDriveService
    ) { }

    ngOnInit() {
        this.loadCategories();
        this.loadResources();
        
        this.googleDriveService.accessToken$.subscribe(token => {
            this.isGoogleAuthenticated = !!token;
            if (this.isGoogleAuthenticated && this.showDriveViewer) {
                this.loadDriveFiles();
            }
        });
    }

    loadCategories() {
        this.authService.getPreferences().subscribe(prefs => {
            if (prefs.appSettings?.coachHubCategories) {
                this.categories = prefs.appSettings.coachHubCategories;
            } else {
                // If no categories in DB, try localStorage migration
                const saved = localStorage.getItem('coach-hub-categories');
                if (saved) {
                    this.categories = JSON.parse(saved);
                    this.saveCategories(); // Save to DB
                }
            }

            if (prefs.appSettings?.googleDriveId) {
                this.googleDriveId = prefs.appSettings.googleDriveId;
                this.updateDriveUrl();
            }

            if (prefs.appSettings?.googleClientId) {
                this.googleClientId = prefs.appSettings.googleClientId;
            }
        });
    }

    saveCategories() {
        // Save locally for immediate UI update
        localStorage.setItem('coach-hub-categories', JSON.stringify(this.categories));
        
        // Save to API
        this.authService.getPreferences().subscribe(prefs => {
            const currentSettings = prefs.appSettings || {};
            currentSettings.coachHubCategories = this.categories;
            currentSettings.googleDriveId = this.googleDriveId;
            currentSettings.googleClientId = this.googleClientId;
            
            this.authService.updatePreferences({ appSettings: currentSettings }).subscribe({
                next: () => {
                    this.toastService.show('Settings updated', 'success');
                    this.updateDriveUrl();
                },
                error: () => this.toastService.show('Failed to save settings', 'error')
            });
        });
    }

    updateDriveUrl() {
        if (!this.googleDriveId) {
            this.safeDriveUrl = null;
            return;
        }

        // Handle full URLs by extracting ID
        let id = this.googleDriveId.trim();
        const folderMatch = id.match(/folders\/([a-zA-Z0-9_-]+)/);
        const idMatch = id.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        
        if (folderMatch) id = folderMatch[1];
        else if (idMatch) id = idMatch[1];

        this.safeDriveUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            `https://drive.google.com/embeddedfolderview?id=${id}#list`
        );
    }

    get enabledCategories() {
        return this.categories.filter(c => c.enabled);
    }

    get selectedCategoryData() {
        return this.categories.find(c => c.id === this.selectedCategory);
    }

    get filteredResources() {
        if (!this.selectedCategory) return [];
        return this.resources.filter(r => r.type === this.selectedCategory);
    }

    loadResources() {
        this.resourcesService.getAll().subscribe(data => {
            this.resources = data;
        });
    }

    selectCategory(categoryId: string) {
        this.selectedCategory = categoryId;
        this.showForm = false;
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.selectedFile = file;
            this.selectedFileName = file.name;
            this.newResource.title = this.newResource.title || file.name;
        }
    }

    addResource() {
        if (!this.newResource.title || !this.selectedCategory) return;

        this.newResource.type = this.selectedCategory;

        let payload;
        if (this.selectedFile) {
            const formData = new FormData();
            formData.append('file', this.selectedFile);
            formData.append('title', this.newResource.title);
            formData.append('type', this.newResource.type);
            formData.append('tags', this.newResource.tags || '');
            payload = formData;
        } else {
            payload = this.newResource;
        }

        this.resourcesService.create(payload).subscribe({
            next: () => {
                this.loadResources();
                this.showForm = false;
                this.selectedFileName = '';
                this.selectedFile = null;
                this.newResource = { title: '', type: this.selectedCategory, content: '', tags: '' };
                this.toastService.show('Resource added successfully', 'success');
            },
            error: (err) => {
                const message = err.error?.message || 'Failed to add resource';
                this.toastService.show(message, 'error');
            }
        });
    }

    async deleteResource(id: number) {
        if (await this.confirmService.confirm('Delete this resource?', 'Delete Resource')) {
            this.resourcesService.delete(id).subscribe(() => {
                this.toastService.show('Resource deleted', 'success');
                this.loadResources();
            });
        }
    }

    isFilePath(content: string): boolean {
        return !!(content && content.startsWith('/uploads/'));
    }

    getFileUrl(content: string): string {
        if (!this.isFilePath(content)) {
            return content;
        }

        return `${environment.apiUrl}${content}`;
    }

    toggleCategory(category: Category) {
        category.enabled = !category.enabled;
        this.saveCategories();
    }

    backToFolders() {
        this.selectedCategory = null;
        this.showForm = false;
        this.showDriveViewer = false;
    }

    openDriveViewer() {
        if (!this.googleDriveId) {
            this.showConfig = true;
            this.toastService.show('Please set your Google Drive ID first', 'info');
            return;
        }
        this.showDriveViewer = true;
        this.selectedCategory = null;
        this.showForm = false;

        if (this.isGoogleAuthenticated) {
            this.loadDriveFiles();
        }
    }

    loginWithGoogle() {
        if (!this.googleClientId) {
            this.showConfig = true;
            this.toastService.show('Please set your Google Client ID in configuration', 'warning');
            return;
        }

        this.googleDriveService.login(this.googleClientId).then(() => {
            this.toastService.show('Connected to Google Drive', 'success');
            this.loadDriveFiles();
        }).catch(err => {
            this.toastService.show('Failed to connect to Google', 'error');
            console.error(err);
        });
    }

    loadDriveFiles() {
        if (!this.googleDriveId) return;
        
        this.loadingDrive = true;
        this.googleDriveService.getFiles(this.googleDriveId).subscribe({
            next: (res) => {
                this.driveFiles = res.files;
                this.loadingDrive = false;
            },
            error: (err) => {
                this.toastService.show('Failed to load cloud files', 'error');
                this.loadingDrive = false;
            }
        });
    }

    disconnectGoogle() {
        this.googleDriveService.logout();
        this.driveFiles = [];
        this.toastService.show('Disconnected from Google', 'info');
    }

    // Category Management Methods
    startEditCategory(category: Category) {
        // Cancel any other editing
        this.categories.forEach(c => c.isEditing = false);
        category.isEditing = true;
    }

    saveRename(category: Category) {
        if (!category.name.trim()) {
            this.toastService.show('Category name cannot be empty', 'error');
            return;
        }
        category.isEditing = false;
        this.saveCategories();
    }

    cancelEdit(category: Category) {
        category.isEditing = false;
        this.loadCategories(); // Reload to reset changes
    }

    addNewCategory() {
        if (!this.newCategory.name.trim()) {
            this.toastService.show('Please enter a category name', 'error');
            return;
        }

        // Generate unique ID from name
        const id = this.newCategory.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

        // Check if ID already exists
        if (this.categories.find(c => c.id === id)) {
            this.toastService.show('A category with this name already exists', 'error');
            return;
        }

        this.categories.push({
            id: id,
            name: this.newCategory.name,
            icon: this.newCategory.icon,
            color: this.newCategory.color,
            enabled: true
        });

        this.saveCategories();
        this.showAddCategory = false;
        this.resetNewCategory();
        this.toastService.show('Category created successfully', 'success');
    }

    resetNewCategory() {
        this.newCategory = {
            id: '',
            name: '',
            icon: '📁',
            color: '#6366f1',
            enabled: true
        };
    }

    async deleteCategory(category: Category) {
        const resourceCount = this.resources.filter(r => r.type === category.id).length;

        if (resourceCount > 0) {
            const confirmed = await this.confirmService.confirm(
                `This category contains ${resourceCount} item(s). Deleting it will also delete all items. Continue?`,
                'Delete Category'
            );
            if (!confirmed) return;
        }

        this.categories = this.categories.filter(c => c.id !== category.id);
        this.saveCategories();
        this.toastService.show('Category deleted', 'success');

        // Reload resources to update the view
        this.loadResources();
    }
}
