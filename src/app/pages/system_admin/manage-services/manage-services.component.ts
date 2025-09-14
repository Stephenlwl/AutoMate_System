import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, doc, setDoc, deleteDoc, query, where } from '@angular/fire/firestore';
import { Observable, combineLatest, map, startWith } from 'rxjs';
import { NgxPaginationModule } from 'ngx-pagination';
import { firstValueFrom } from 'rxjs';

export interface Category {
  id?: string;
  name: string;
  description?: string;
  active: boolean;
  status?: string;
  createdBy?: string;
  createdAt?: any;
}

export interface Service {
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  active: boolean;
  categoryName?: string;
  status?: string;
}

export interface PendingCategories {
  id?: string;
  name: string;
  description?: string;
  active: boolean;
  status?: string;
  createdBy?: string;
  createdAt?: any;
}

export interface PendingService {
  id?: string;
  categoryId: string;
  name: string;
  categoryName: string;
  description?: string;
  active: boolean;
  status?: string;
}

@Component({
  selector: 'app-manage-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgxPaginationModule],
  styleUrls: ['./manage-services.component.css'],
  templateUrl: './manage-services.component.html'
})
export class ManageServicesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);

  categoryForm!: FormGroup;
  serviceForm!: FormGroup;

  searchControl = this.fb.control('');
  categoryFilterControl = this.fb.control('allCategories');
  activeFilterControl = new FormControl('all');

  filteredServices$!: Observable<Service[]>;
  categories$!: Observable<Category[]>;
  services$!: Observable<Service[]>;
  pendingCategories$!: Observable<Category[]>;
  pendingServices$!: Observable<Service[]>;

  selectedCategoryId: string | null = null;
  editingCategory: Category | null = null;
  editingService: Service | null = null;

  loading = false;
  errorMessage = '';
  currentPage = 1;
  pageSize = 5;

  ngOnInit(): void {
    this.initForms();
    this.loadCategories();
    this.loadServices();
    this.loadServicesOverview();
    this.loadCategoryRequests();
    this.loadServiceRequests();
  }

  private initForms() {
    this.categoryForm = this.fb.group({
      id: [''],
      name: ['', Validators.required],
      description: [''],
      active: [true],
      status: ['approved'],
    });

    this.serviceForm = this.fb.group({
      id: [''],
      categoryId: ['', Validators.required],
      name: ['', Validators.required],
      description: [''],
      active: [true],
      status: ['approved'],
    });
  }

  private loadServicesOverview() {
    this.loading = true;
    try {
      this.filteredServices$ = combineLatest([this.services$,
      this.categories$,
      this.searchControl.valueChanges.pipe(startWith('')),
      this.categoryFilterControl.valueChanges.pipe(startWith('allCategories')),
      this.activeFilterControl.valueChanges.pipe(startWith('all'))]).pipe(
        map(([services, categories, search, categoryFilter, activeFilter]) => {
          let sortedServices = services.map(service => ({
            ...service,
            categoryName: categories.find(c => c.id === service.categoryId)?.name || 'Unknown Category'
          }))
          sortedServices = sortedServices.sort((a, b) => a.name.localeCompare(b.name));
          return sortedServices.filter(service => {
            const searchValue = (search ?? '').toLowerCase();
            const matchesSearch = service.name.toLowerCase().includes(searchValue);
            const matchesCategory = categoryFilter === 'allCategories' || service.categoryId === categoryFilter;
            const isActive = activeFilter === 'all' || (activeFilter === 'active' && service.active) || (activeFilter === 'inactive' && !service.active);
            this.currentPage = 1;
            return matchesSearch && matchesCategory && isActive;
          });
        })
      );
    } catch (error) {
      console.error('Error loading services overview:', error);
      this.errorMessage = 'Failed to load services overview';
    } finally {
      this.loading = false;
    }
  }

  private loadCategories() {
    try {
      const categoriesRef = collection(this.firestore, 'services_categories');
      const q = query(categoriesRef, where('status', '==', 'approved'));
      this.categories$ = collectionData(q, { idField: 'id' }) as Observable<Category[]>;
    } catch (error) {
      console.error('Error loading categories:', error);
      this.errorMessage = 'Failed to load categories';
    }
  }

  private loadServices() {
    try {
      const servicesRef = collection(this.firestore, 'services');
      const q = query(servicesRef, where('status', '==', 'approved'));
      this.services$ = collectionData(q, { idField: 'id' }) as Observable<Service[]>;
    } catch (error) {
      console.error('Error loading services:', error);
      this.errorMessage = 'Failed to load services';
    }
  }

  async saveCategory() {
    if (this.categoryForm.invalid) return;

    const { id, ...data } = this.categoryForm.value as Category;
    try {
      if (id) {
        await setDoc(doc(this.firestore, 'services_categories', id), { id, ...data }, { merge: true });
      } else {
        await addDoc(collection(this.firestore, 'services_categories'), data);
      }
      this.resetCategoryForm();
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  editCategory(category: Category) {
    this.editingCategory = category;
    this.categoryForm.patchValue(category);
  }

  resetCategoryForm() {
    this.editingCategory = null;
    this.categoryForm.reset({
      id: '',
      name: '',
      description: '',
      active: true,
    });
  }

  async deleteCategory(id: string) {
    try {
      const hasServices = await firstValueFrom(
        this.services$.pipe(map(services => services.some(s => s.categoryId === id)))
      );
      if (hasServices) {
        alert('This category still has services. Please reassign or delete those first.');
        return;
      }

      await deleteDoc(doc(this.firestore, 'services_categories', id));
      if (this.selectedCategoryId === id) this.selectedCategoryId = null;
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  async toggleCategoryActive(category: Category) {
    try {
      await setDoc(doc(this.firestore, 'services_categories', category.id!), { active: !category.active }, { merge: true });
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  async saveService() {
    if (this.serviceForm.invalid) return;

    const { id, ...data } = this.serviceForm.value as Service;
    try {
      if (id) {
        await setDoc(doc(this.firestore, 'services', id), { id, ...data }, { merge: true });
      } else {
        await addDoc(collection(this.firestore, 'services'), data);
      }
      this.resetServiceForm();
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  editService(service: Service) {
    this.editingService = service;
    this.serviceForm.patchValue(service);
  }

  resetServiceForm() {
    this.editingService = null;
    this.serviceForm.reset({
      id: '',
      categoryId: this.selectedCategoryId ?? '',
      name: '',
      description: '',
      active: true,
    });
  }

  async deleteService(id: string) {
    try {
      await deleteDoc(doc(this.firestore, 'services', id));
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  async toggleServiceActive(service: Service) {
    try {
      await setDoc(doc(this.firestore, 'services', service.id!), { active: !service.active }, { merge: true });
    } catch (err: any) {
      this.errorMessage = err.message;
    }
  }

  pickCategory(id: string) {
    this.selectedCategoryId = id;
    this.serviceForm.patchValue({ categoryId: id });
  }

  filterServicesByCategory(allServices: Service[]): Service[] {
    const categoryId = this.serviceForm.get('categoryId')?.value;
    if (!categoryId) return []; // if no category selected, return empty
    return allServices.filter(s => s.categoryId === categoryId);
  }

  // Load pending requests
  loadCategoryRequests() {
    const ref = collection(this.firestore, 'services_categories_request');
    const q = query(ref, where('status', '==', 'pending'));
    this.pendingCategories$ = collectionData(q, { idField: 'id' }) as Observable<Category[]>;
  }

  loadServiceRequests() {
    const ref = collection(this.firestore, 'services_request');
    const q = query(ref, where('status', '==', 'pending'));
    this.pendingServices$ = collectionData(q, { idField: 'id' }) as Observable<Service[]>;

    const categoriesRef = collection(this.firestore, 'services_categories');
    const catq = query(categoriesRef, where('status', '==', 'approved'), where('active', '==', true));
    // merging service requests with category names based on the cat id
    this.pendingServices$ = combineLatest([
      collectionData(q, { idField: 'id' }) as Observable<Service[]>,
      collectionData(catq, { idField: 'id' }) as Observable<Category[]>
    ]).pipe(
      map(([services, categories]) => {
        return services.map(service => ({
          ...service,
          categoryName: categories.find(c => c.id === service.categoryId)?.name || 'Unknown Category'
        }));
      })
    );
  }

  // Approve category request
  async approveCategoryRequest(request: Category) {
    try {
      await addDoc(collection(this.firestore, 'services_categories'), {
        name: request.name,
        description: request.description,
        active: true,
        status: 'approved'
      });

      // Mark the request as approved
      await setDoc(doc(this.firestore, 'services_categories_request', request.id!), { status: 'approved' }, { merge: true });
    } catch (err: any) {
      console.error('Error approving category request:', err);
    }
  }

  // Reject category request
  async rejectCategoryRequest(request: Category) {
    try {
      await setDoc(doc(this.firestore, 'services_categories_request', request.id!), { status: 'rejected' }, { merge: true });
    } catch (err: any) {
      console.error('Error rejecting category request:', err);
    }
  }

  // Approve service request
  async approveServiceRequest(request: Service) {
    try {
      await addDoc(collection(this.firestore, 'services'), {
        categoryId: request.categoryId,
        name: request.name,
        description: request.description,
        active: true,
        status: 'approved'
      });

      await setDoc(doc(this.firestore, 'services_request', request.id!), { status: 'approved' }, { merge: true });
    } catch (err: any) {
      console.error('Error approving service request:', err);
    }
  }

  // Reject service request
  async rejectServiceRequest(request: Service) {
    try {
      await setDoc(doc(this.firestore, 'services_request', request.id!), { status: 'rejected' }, { merge: true });
    } catch (err: any) {
      console.error('Error rejecting service request:', err);
    }
  }
}
