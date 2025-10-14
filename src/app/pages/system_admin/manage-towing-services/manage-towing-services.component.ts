import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { startWith, map } from 'rxjs/operators';
import { NgxPaginationModule } from 'ngx-pagination';

export interface TowingService {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

@Component({
  selector: 'app-manage-towing-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgxPaginationModule],
  templateUrl: './manage-towing-services.component.html',
  styleUrls: ['./manage-towing-services.component.css']
})
export class ManageTowingServicesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);

  towingServiceForm!: FormGroup;
  towingServices$!: Observable<TowingService[]>;
  filteredServices$!: Observable<TowingService[]>;

  page = 1;
  pageSize = 5;
  paginatedServices$!: Observable<TowingService[]>;
  editingService: TowingService | null = null;
  searchControl = this.fb.control('');
  statusFilterControl = this.fb.control('all');
  typeFilterControl = this.fb.control('all');
  loading = false;
  isSubmitting = false;

  ngOnInit(): void {
    this.initForm();
    this.loadTowingServices();
  }

  private initForm() {
    this.towingServiceForm = this.fb.group({
      name: [''],
      description: [''],
      active: [true]
    });
  }

  loadTowingServices() {
    const towingServicesRef = collection(this.firestore, 'towing_services');
    this.towingServices$ = collectionData(towingServicesRef, { idField: 'id' }) as Observable<TowingService[]>;

    // Combine filters
    this.filteredServices$ = combineLatest([
      this.towingServices$,
      this.searchControl.valueChanges.pipe(startWith('')),
      this.statusFilterControl.valueChanges.pipe(startWith('all'))
    ]).pipe(
      map(([services, search, status]) => {
        search = (search || '').toLowerCase();

        return services.filter(service => {
          const matchesSearch =
            service.name.toLowerCase().includes(search) ||
            service.description.toLowerCase().includes(search);

          const matchesStatus =
            status === 'all' ||
            (status === 'active' && service.active) ||
            (status === 'inactive' && !service.active);

          return matchesSearch && matchesStatus;
        });
      })
    );

    // Apply pagination
    this.paginatedServices$ = combineLatest([
      this.filteredServices$,
      new BehaviorSubject(this.page)
    ]).pipe(
      map(([services]) => {
        const start = (this.page - 1) * this.pageSize;
        return services.slice(start, start + this.pageSize);
      })
    );
  }

  async onSubmit() {
    if (this.towingServiceForm.invalid) {
      this.markFormGroupTouched(this.towingServiceForm);
      return;
    }

    this.isSubmitting = true;

    try {
      const formData = this.towingServiceForm.value;
      const serviceData = {
        name: formData.name,
        description: formData.description,
        active: formData.active,
        updatedAt: new Date()
      };

      if (this.editingService?.id) {
        // Update existing service
        await updateDoc(doc(this.firestore, 'towing_services', this.editingService.id), serviceData);
        alert('Towing service updated successfully!');
      } else {
        // Create new service
        const newService = {
          ...serviceData,
          createdAt: new Date()
        };
        const towingServicesRef = collection(this.firestore, 'towing_services');
        await addDoc(towingServicesRef, newService);
        alert('Towing service added successfully!');
      }

      this.resetForm();
    } catch (error) {
      console.error('Error saving towing service:', error);
      alert('Error saving towing service. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }

  editService(service: TowingService) {
    this.editingService = service;
    this.towingServiceForm.patchValue({
      name: service.name,
      description: service.description,
      active: service.active
    });

    // Scroll to form
    document.getElementById('service-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async deleteService(service: TowingService) {
    if (!confirm(`Are you sure you want to delete "${service.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (service.id) {
        await deleteDoc(doc(this.firestore, 'towing_services', service.id));
        alert('Towing service deleted successfully!');

        // Reset form if editing the deleted service
        if (this.editingService?.id === service.id) {
          this.resetForm();
        }
      }
    } catch (error) {
      console.error('Error deleting towing service:', error);
      alert('Error deleting towing service. Please try again.');
    }
  }

  async toggleServiceActive(service: TowingService) {
    try {
      if (service.id) {
        await updateDoc(doc(this.firestore, 'towing_services', service.id), {
          active: !service.active,
          updatedAt: new Date()
        });

        const action = service.active ? 'disabled' : 'enabled';
        alert(`Towing service ${action} successfully!`);
      }
    } catch (error) {
      console.error('Error toggling service status:', error);
      alert('Error updating service status. Please try again.');
    }
  }

  resetForm() {
    this.editingService = null;
    this.towingServiceForm.reset({
      name: '',
      description: '',
      active: true
    });
  }

  cancelEdit() {
    this.resetForm();
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // Helper method to check if form field is invalid
  isFieldInvalid(fieldName: string): boolean {
    const field = this.towingServiceForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}