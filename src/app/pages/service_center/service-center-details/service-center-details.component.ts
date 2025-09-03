import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-service-center-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './service-center-details.component.html',
  styleUrls: ['./service-center-details.component.css']
})
export class ServiceCenterDetailsComponent {
  private fs = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  serviceCenterId!: string;
  serviceForm!: FormGroup;
  closureForm!: FormGroup;

  daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  get operatingHoursArray(): FormArray {
    return this.serviceForm.get('operatingHours') as FormArray;
  }
  get closuresArray(): FormArray {
    return this.serviceForm.get('specialClosures') as FormArray;
  }

  async ngOnInit() {
    this.serviceCenterId = this.auth.getAdmin().id;

    this.serviceForm = this.fb.group({
      name: [''],
      addressLine1: [''],
      addressLine2: [''],
      city: [''],
      state: [''],
      postalCode: [''],
      operatingHours: this.fb.array([]),
      specialClosures: this.fb.array([])
    });

    this.closureForm = this.fb.group({
      date: ['', Validators.required],
      reason: ['']
    });

    const snap = await getDoc(doc(this.fs, 'service_centers', this.serviceCenterId));
    const w: any = snap.data();

    if (w) {
      this.serviceForm.patchValue({
        name: w?.serviceCenterInfo?.name || '',
        addressLine1: w?.serviceCenterInfo?.address?.addressLine1 || '',
        addressLine2: w?.serviceCenterInfo?.address?.addressLine2 || '',
        city: w?.serviceCenterInfo?.address?.city || '',
        state: w?.serviceCenterInfo?.address?.state || '',
        postalCode: w?.serviceCenterInfo?.address?.postalCode || ''
      });

      if (w?.operatingHours?.length) {
        w.operatingHours.forEach((oh: any) => {
          this.operatingHoursArray.push(
            this.fb.group({
              day: [oh.day],
              isClosed: [oh.isClosed],
              open: [oh.open],
              close: [oh.close]
            })
          );
        });
      } else {
        this.daysOfWeek.forEach(day =>
          this.operatingHoursArray.push(
            this.fb.group({
              day: [day],
              isClosed: [false],
              open: ['09:00'],
              close: ['18:00']
            })
          )
        );
      }

      if (w?.specialClosures?.length) {
        w.specialClosures.forEach((sc: any) =>
          this.closuresArray.push(this.fb.group({
            date: [sc.date],
            reason: [sc.reason]
          }))
        );
      }
    }

    this.setupOperatingHoursWatcher();
  }

  setupOperatingHoursWatcher() {
    this.operatingHoursArray.controls.forEach(control => {
      const group = control as FormGroup;
      const isClosedControl = group.get('isClosed');
      const openControl = group.get('open');
      const closeControl = group.get('close');

      isClosedControl?.valueChanges.subscribe((isClosed: boolean) => {
        if (isClosed) {
          openControl?.setValue('');
          closeControl?.setValue('');
          openControl?.disable();
          closeControl?.disable();
        } else {
          openControl?.enable();
          closeControl?.enable();
          if (!openControl?.value) openControl?.setValue('09:00');
          if (!closeControl?.value) closeControl?.setValue('18:00');
        }
      });

      if (isClosedControl?.value) {
        openControl?.disable();
        closeControl?.disable();
      }
    });
  }

  addClosure() {
    if (this.closureForm.invalid) {
      alert('Please select a date');
      return;
    }
    const date = this.closureForm.value.date;
    const reason = this.closureForm.value.reason || 'Closed';

    if (this.closuresArray.value.some((c: any) => c.date === date)) {
      alert('This date is already marked as closed');
      return;
    }

    this.closuresArray.push(this.fb.group({ date, reason }));
    this.closuresArray.patchValue(
      [...this.closuresArray.value].sort((a, b) => a.date.localeCompare(b.date))
    );

    this.closureForm.reset();
  }

  removeClosure(index: number) {
    this.closuresArray.removeAt(index);
  }

  async save() {
    await updateDoc(doc(this.fs, 'service_centers', this.serviceCenterId), {
      serviceCenterInfo: {
        name: this.serviceForm.value.name,
        address: {
          addressLine1: this.serviceForm.value.addressLine1,
          addressLine2: this.serviceForm.value.addressLine2,
          city: this.serviceForm.value.city,
          state: this.serviceForm.value.state,
          postalCode: this.serviceForm.value.postalCode
        }
      },
      operatingHours: this.serviceForm.value.operatingHours,
      specialClosures: this.serviceForm.value.specialClosures
    });
    alert('Saved.');
  }
}
