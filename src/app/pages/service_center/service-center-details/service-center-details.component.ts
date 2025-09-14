import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-service-center-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './service-center-details.component.html',
  styleUrls: ['./service-center-details.component.css']
})
export class ServiceCenterDetailsComponent {
  private fs = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private secretKey = environment.encryptionKey;

  serviceCenterId!: string;
  serviceForm!: FormGroup;
  closureForm!: FormGroup;
  currentDate = new Date();
  today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  publicHolidayAPIKey = "ylFUQtHCTcUG7jr8/k5zBA==ndbOESrseB6tB5vO";
  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  uploadedImages: string[] = [];
  holidays: any[] = [];
  selectedImage: string | null = null;
  serviceCenterInfoLoading = false;
  operatingWatcherSetupLoading = false;
  publicHolidayDataLoading = false;
  serviceCenterClosureDayLoading = false;
  isSaving = false;
  isImageModalOpen = false;

  get operatingHoursArray(): FormArray {
    return this.serviceForm.get('operatingHours') as FormArray;
  }
  get closuresArray(): FormArray {
    return this.serviceForm.get('specialClosures') as FormArray;
  }

  async ngOnInit() {
    this.serviceCenterId = this.auth.getAdmin().id;

    this.serviceForm = this.fb.group({
      name: [{ value: '', disabled: true }],
      phoneNo: [''],
      description: [''],
      addressLine1: [''],
      addressLine2: [''],
      city: [''],
      state: [''],
      postalCode: [''],
      operatingHours: this.fb.array([]),
      specialClosures: this.fb.array([]),
      images: [[]]
    });

    this.closureForm = this.fb.group({
      date: ['', Validators.required],
      reason: ['']
    });

    this.loadServiceCenterDetails();
    this.setupOperatingHoursWatcher();
    this.loadPublicHolidays();
  }

  async loadServiceCenterDetails() {
    this.serviceCenterInfoLoading = true;
    try {

      // fetch service center info data
      const snap = await getDoc(doc(this.fs, 'service_centers', this.serviceCenterId));
      const data: any = snap.data();

      if (data) {
        this.serviceForm.patchValue({
          name: data?.serviceCenterInfo?.name || '',
          phoneNo: data?.serviceCenterInfo?.serviceCenterPhoneNo || '',
          description: data?.serviceCenterInfo?.description || '',
          addressLine1: data?.serviceCenterInfo?.address?.addressLine1 || '',
          addressLine2: data?.serviceCenterInfo?.address?.addressLine2 || '',
          city: data?.serviceCenterInfo?.address?.city || '',
          state: data?.serviceCenterInfo?.address?.state || '',
          postalCode: data?.serviceCenterInfo?.address?.postalCode || '',
          images: data?.serviceCenterInfo?.images || []
        });

        // store decrypted images to display
        if (data?.serviceCenterInfo?.images) {
          this.uploadedImages = data.serviceCenterInfo.images.map((img: string) =>
            this.decryptData(img)
          );
        }

        if (data?.operatingHours?.length) {
          data.operatingHours.forEach((oh: any) => {
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

        if (data?.specialClosures?.length) {
          data.specialClosures.forEach((sc: any) =>
            this.closuresArray.push(this.fb.group({
              date: [sc.date],
              reason: [sc.reason]
            }))
          );
        }
      }
    } catch (error) {
      alert(error + ' - Failed to load service center details');
      console.error('Failed to load service center details', error);
    } finally {
      this.serviceCenterInfoLoading = false;
    }

  }

  // watcher for operating hours
  setupOperatingHoursWatcher() {
    this.operatingWatcherSetupLoading = true;

    try {
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
    } catch (error) {
      console.error('Failed to set up operating hours watcher', error);
    } finally {
      this.operatingWatcherSetupLoading = false;
    }
  }

  async loadPublicHolidays() {
    this.publicHolidayDataLoading = true;

    try {
      const headers = new HttpHeaders({
        'X-Api-Key': this.publicHolidayAPIKey
      });

      this.http.get<any[]>(
        `https://api.api-ninjas.com/v1/holidays?country=MY`,
        { headers }
      ).subscribe({
        next: (data) => {
          this.holidays = data.filter(h => new Date(h.date) >= this.currentDate);

          this.holidays.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        },
        error: (err) => {
          console.error('Failed to load holidays', err);
        }
      });
    } catch (error) {
      alert("Failed to load public holidays: " + error);
      console.error('Failed to load public holidays', error);
    } finally {
      this.publicHolidayDataLoading = false;
    }
  }

  addHolidayClosure(h: any) {
    const date = h.date;
    const reason = h.name;

    //  deduplicates
    if (this.closuresArray.value.some((c: any) => c.date === date)) {
      alert('This date is already marked as closed');
      return;
    }

    this.closuresArray.push(this.fb.group({ date, reason }));

    // Sort closures by date
    const sorted = [...this.closuresArray.value].sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    this.closuresArray.clear();
    sorted.forEach(c => {
      this.closuresArray.push(this.fb.group({ date: c.date, reason: c.reason }));
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

    //add new closure
    this.closuresArray.push(this.fb.group({ date, reason }));

    // Sort closures by date
    const sorted = [...this.closuresArray.value].sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    // clear and rebuild form array in sorted order
    this.closuresArray.clear();
    sorted.forEach(c => {
      this.closuresArray.push(this.fb.group({ date: c.date, reason: c.reason }));
    });

    this.closureForm.reset();
  }

  removeClosure(index: number) {
    this.closuresArray.removeAt(index);

    // keep sorted after deletion
    const sorted = [...this.closuresArray.value].sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    this.closuresArray.clear();
    sorted.forEach(c => {
      this.closuresArray.push(this.fb.group({ date: c.date, reason: c.reason }));
    });
  }


  // file upload handler
  async handleFileInput(event: any) {
    const files: FileList = event.target.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await this.convertToBase64(file);
      const encrypted = this.encryptData(base64);

      // Add encrypted image to form properly
      const currentImages = this.serviceForm.value.images || [];
      this.serviceForm.patchValue({
        images: [...currentImages, encrypted]
      });

      // Add base64 image for preview
      this.uploadedImages.push(base64);
    }
  }

  viewImage(img: string) {
    this.selectedImage = img;
    this.isImageModalOpen = true;
  }

  closeImageModal() {
    this.isImageModalOpen = false;
    this.selectedImage = null;
  }

  removeImage(index: number) {
    this.uploadedImages.splice(index, 1);
    const currentImages = [...(this.serviceForm.value.images || [])];
    currentImages.splice(index, 1);
    this.serviceForm.patchValue({ images: currentImages });
  }

  // convert file to base64
  convertToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  // encrypt
  encryptData(data: string): string {
    return CryptoJS.AES.encrypt(data, this.secretKey).toString();
  }

  // decrypt
  decryptData(data: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(data, this.secretKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Decryption error:', error);
      return '';
    }
  }

  async save() {
    this.isSaving = true;

    if (!this.serviceForm.value.phoneNo.match(/^(\+?6?0)[0-9]{8,10}$/)) {
      alert('Please provide a valid phone number.');
      this.isSaving = false;
      return;
    } 

    try {
      await updateDoc(doc(this.fs, 'service_centers', this.serviceCenterId), {
        "serviceCenterInfo.name": this.serviceForm.getRawValue().name,
        "serviceCenterInfo.serviceCenterPhoneNo": this.serviceForm.value.phoneNo,
        "serviceCenterInfo.description": this.serviceForm.value.description,
        "serviceCenterInfo.address": {
          addressLine1: this.serviceForm.value.addressLine1,
          addressLine2: this.serviceForm.value.addressLine2,
          city: this.serviceForm.value.city,
          state: this.serviceForm.value.state,
          postalCode: this.serviceForm.value.postalCode
        },
        "serviceCenterInfo.images": this.serviceForm.value.images,
        operatingHours: this.serviceForm.value.operatingHours,
        specialClosures: this.serviceForm.value.specialClosures
      });
      alert('Service Center details have been successfully updated.');
    } catch (error) {
      alert('Failed to save service center details: ' + error);
      console.error('Failed to save service center details', error);
    } finally {
      this.isSaving = false;
    }
  }
}
