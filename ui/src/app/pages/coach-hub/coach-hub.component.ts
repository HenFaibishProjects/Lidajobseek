import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourcesService } from '../../services/resources.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { FilterPipe } from '../../pipes/filter.pipe';
import { environment } from '../../../environments/environment';

interface Category {
    id: string;
    name: string;
    icon: string;
    color: string;
    enabled: boolean;
    isEditing?: boolean;
}

@Component({
    selector: 'app-coach-hub',
    standalone: true,
    imports: [CommonModule, FormsModule, FilterPipe],
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
        private toastService: ToastService
    ) { }

    ngOnInit() {
        this.loadCategories();
        this.loadResources();
    }

    loadCategories() {
        const saved = localStorage.getItem('coach-hub-categories');
        if (saved) {
            this.categories = JSON.parse(saved);
        }
    }

    saveCategories() {
        localStorage.setItem('coach-hub-categories', JSON.stringify(this.categories));
        this.toastService.show('Categories updated', 'success');
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

        this.resourcesService.create(payload).subscribe(() => {
            this.loadResources();
            this.showForm = false;
            this.selectedFileName = '';
            this.selectedFile = null;
            this.newResource = { title: '', type: this.selectedCategory, content: '', tags: '' };
            this.toastService.show('Resource added successfully', 'success');
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
