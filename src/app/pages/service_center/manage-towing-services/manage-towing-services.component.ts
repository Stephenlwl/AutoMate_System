import { Component, OnInit, inject } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { CommonModule } from '@angular/common';

interface SizePricing {
  sizeClass: string;
  baseFee: number;
  perKmRate: number;
}

interface LuxurySurcharge {
  make: string;
  surcharge: number;
}

interface ServiceFee {
  type: string;
  fee: number;
}

interface DaySchedule {
  day: string;
  isClosed: boolean;
  startHour?: string;
  endHour?: string;
}

interface TowingConfig {
  offers: boolean;
  types: string[];
  coverageKm: number;
  sizePricing: SizePricing[];
  luxurySurcharge?: LuxurySurcharge[];
  serviceFees?: ServiceFee[];
  schedule: DaySchedule[];
  responseTimeMins?: number;
  status?: 'active' | 'inactive' | 'pending';
}

@Component({
  selector: 'app-manage-towing-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-towing-services.component.html',
  styleUrls: ['./manage-towing-services.component.css']
})
export class ServiceCenterTowingServicesComponent implements OnInit {
  private fs = inject(Firestore);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  towingForm!: FormGroup;
  loading = false;
  serviceCenterId!: string;
  hasApprovedDriver = false;
  allSizeClasses: string[] = [];
  allMakes: string[] = [];
  allTowingServices: string[] = [];
  isSaving = false;
  errorMessage = '';

  weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  ngOnInit() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    this.initForm();
    this.fetchAllSizeClasses();
    this.fetchAllMakes();
    this.fetchAllTowingServices();
    this.checkDriverApproval();
    this.setupScheduleWatcher();
  }

  async initForm() {
    const snap = await getDocs(collection(this.fs, 'towing_services'));
    this.allTowingServices = snap.docs.map(d => d.data()['name']);

    this.towingForm = this.fb.group({
      offers: [false],
      types: [[], (towing: any) => {
        if (this.towingForm?.get('offers')?.value && (!towing || towing.length === 0)) {
          return { required: true };
        }
        return null;
      }],
      coverageKm: [25, [Validators.required, Validators.min(1)]],
      responseTimeMins: [null, Validators.min(0)],
      sizePricing: this.fb.array([]),
      luxurySurcharge: this.fb.array([]),
      serviceFees: this.fb.array([]),
      schedule: this.fb.array(
        this.weekDays.map(d =>
          this.fb.group({
            day: [d],
            isClosed: [false],
            startHour: ['09:00', Validators.required],
            endHour: ['18:00', Validators.required]
          })
        )
      )
    });
  }

  get scheduleArray(): FormArray {
    return this.towingForm.get('schedule') as FormArray;
  }
  get sizePricingArray(): FormArray {
    return this.towingForm.get('sizePricing') as FormArray;
  }
  get luxuryArray(): FormArray {
    return this.towingForm.get('luxurySurcharge') as FormArray;
  }
  get serviceFeesArray(): FormArray {
    return this.towingForm.get('serviceFees') as FormArray;
  }

  async checkDriverApproval() {
    this.loading = true;
    try {
      const driversRef = collection(this.fs, 'drivers');
      const q = query(
        driversRef,
        where('serviceCenterId', '==', this.serviceCenterId),
        where('status', '==', 'approved')
      );
      const snap = await getDocs(q);
      this.hasApprovedDriver = !snap.empty;
      if (this.hasApprovedDriver) await this.loadExistingConfig();
    } catch (err) {
      console.error('Error checking driver approval:', err);
      this.errorMessage = 'Failed to verify towing driver status.';
    } finally {
      this.loading = false;
    }
  }

  async loadExistingConfig() {
    try {
      const docRef = doc(this.fs, 'service_center_towing_services_offer', this.serviceCenterId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return;

      const towing: TowingConfig = snap.data()?.['towing'] || {} as TowingConfig;

      this.towingForm.patchValue({
        offers: towing.offers ?? false,
        types: towing.types ?? [],
        coverageKm: towing.coverageKm ?? 25,
        responseTimeMins: towing.responseTimeMins ?? null,
        schedule: towing.schedule ?? []
      });

      if (towing.sizePricing) {
        towing.sizePricing.forEach(sp => {
          const ctrl = this.sizePricingArray.controls.find(c => c.get('sizeClass')?.value === sp.sizeClass);
          if (ctrl) ctrl.patchValue(sp);
        });
      }

      if (towing.luxurySurcharge) {
        towing.luxurySurcharge.forEach(lux => {
          const ctrl = this.luxuryArray.controls.find(c => c.get('make')?.value === lux.make);
          if (ctrl) ctrl.patchValue(lux);
        });
      }

      if (towing.serviceFees) {
        towing.serviceFees.forEach(fee => {
          const ctrl = this.serviceFeesArray.controls.find(c => c.get('type')?.value === fee.type);
          if (ctrl) {
            ctrl.patchValue(fee);
            const feeCtrl = ctrl.get('fee');
            if ((towing.types || []).includes(fee.type) && feeCtrl) {
              feeCtrl.enable();
              feeCtrl.setValidators([Validators.required, Validators.min(0)]);
              feeCtrl.updateValueAndValidity();
            }
          }
        });
      }
    } catch (err) {
      console.error('Error loading towing config:', err);
      this.errorMessage = 'Failed to load existing towing configuration.';
    }
  }

  async fetchAllSizeClasses() {
    try {
      const snap = await getDocs(collection(this.fs, 'vehicles_list'));
      const sizeSet = new Set<string>();
      snap.forEach(doc => {
        const data: any = doc.data();
        if (Array.isArray(data.model)) {
          data.model.forEach((m: any) => {
            if (Array.isArray(m.fitments)) {
              m.fitments.forEach((f: any) => {
                if (f.sizeClass) sizeSet.add(f.sizeClass.trim());
              });
            }
          });
        }
      });
      this.allSizeClasses = Array.from(sizeSet).sort();

      const sizeArray = this.fb.array(
        this.allSizeClasses.map(size =>
          this.fb.group({
            sizeClass: [size],
            baseFee: [null],
            perKmRate: [null]
          })
        )
      );
      this.towingForm.setControl('sizePricing', sizeArray);
    } catch (err) {
      console.error('Error fetching size classes:', err);
    }
  }

  async fetchAllMakes() {
    try {
      const snap = await getDocs(collection(this.fs, 'vehicles_list'));
      const makesSet = new Set<string>();
      snap.forEach(doc => {
        const data: any = doc.data();
        if (data.make) makesSet.add(data.make.trim());
      });
      this.allMakes = Array.from(makesSet).sort();

      const luxArray = this.fb.array(
        this.allMakes.map(make =>
          this.fb.group({
            make: [make],
            surcharge: [null]
          })
        )
      );
      this.towingForm.setControl('luxurySurcharge', luxArray);
    } catch (err) {
      console.error('Error fetching makes:', err);
    }
  }

  async fetchAllTowingServices() {
    try {
      const q = query(collection(this.fs, 'towing_services'), where('active', '==', true));
      const snap = await getDocs(q);
      this.allTowingServices = snap.docs.map(d => d.data()['name']);

      // Rebuild serviceFees array dynamically
      const feesArray = this.fb.array(
        this.allTowingServices.map(t =>
          this.fb.group({
            type: [t],
            fee: [{ value: null, disabled: true }, []]
          })
        )
      );
      this.towingForm.setControl('serviceFees', feesArray);

      await this.loadExistingConfig();
    } catch (err) {
      console.error('Error fetching towing services:', err);
    }
  }

  setupScheduleWatcher() {
    this.scheduleArray.controls.forEach(day => {
      day.get('isClosed')?.valueChanges.subscribe(closed => {
        if (closed) {
          day.get('startHour')?.disable();
          day.get('endHour')?.disable();
          day.patchValue({ startHour: '', endHour: '' });
        } else {
          day.get('startHour')?.enable();
          day.get('endHour')?.enable();
          if (!day.get('startHour')?.value) day.patchValue({ startHour: '09:00' });
          if (!day.get('endHour')?.value) day.patchValue({ endHour: '18:00' });
        }
      });
    });
  }

  async save() {
    if (!this.hasApprovedDriver) {
      this.errorMessage = 'You need an approved towing driver before configuring towing services.';
      return;
    }
    if (this.towingForm.invalid) {
      this.errorMessage = 'Please fill in required fields correctly.';
      return;
    }

    try {
      this.isSaving = true;

      const towingConfig: TowingConfig = this.towingForm.value;

      const docRef = doc(this.fs, 'service_center_towing_services_offer', this.serviceCenterId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        await updateDoc(docRef, { towing: towingConfig, updatedAt: new Date() });
      } else {
        await setDoc(docRef, {
          towing: towingConfig,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      this.errorMessage = '';
      this.isSaving = false;
      alert('Towing configuration saved.');
    } catch (err: any) {
      console.error('Error saving towing config:', err);
      this.errorMessage = 'Failed to save towing configuration: ' + err.message;
      this.isSaving = false;
    }
  }

  isTypeSelected(type: string): boolean {
    return (this.towingForm.value.types || []).includes(type);
  }

  toggleType(type: string) {
    const arr = [...(this.towingForm.value.types || [])];
    const idx = arr.indexOf(type);
    const feeCtrl = this.serviceFeesArray.controls.find(
      c => c.get('type')?.value === type
    )?.get('fee');

    if (idx >= 0) {
      // unselect will remove then disable fee
      arr.splice(idx, 1);
      if (feeCtrl) {
        feeCtrl.disable();
        feeCtrl.clearValidators();
        feeCtrl.setValue(null);
        feeCtrl.updateValueAndValidity();
      }
    } else {
      // select will add then enable fee
      arr.push(type);
      if (feeCtrl) {
        feeCtrl.enable();
        feeCtrl.setValidators([Validators.required, Validators.min(0)]);
        feeCtrl.updateValueAndValidity();
      }
    }
    this.towingForm.patchValue({ types: arr });
  }
}
