import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, addDoc, doc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-manage-staff-towing-driver',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './manage-staff-towing-driver.component.html',
  styleUrls: ['./manage-staff-towing-driver.component.css']
})
export class ManageStaffTowingDriverComponent {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private secretKey = environment.encryptionKey;

  tab: 'staff' | 'driver' = 'staff';
  staff: any[] = [];
  drivers: any[] = [];

  // For preview + encrypted storage
  vehicleImages: string[] = [];
  uploadedVehicleImages: string[] = [];
  driverImage: string | null = null;
  uploadedDriverImage: string | null = null;
  drivingLicenseImage: string | null = null;
  uploadedDrivingLicense: string | null = null;
  serviceCenterId: string | null = null;
  serviceCenterName: string | null = null;
  selectedImage: string | null = null;
  isImageModalOpen = false;
  editingStaffId: string | null = null;
  editingDriverId: string | null = null;
  loadingAddStaff = false;
  loadingAddDriver = false;

  staffForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['technician', Validators.required],
  });

  driverForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phoneNo: ['', Validators.required],
    make: ['', Validators.required],
    model: ['', Validators.required],
    year: ['', Validators.required],
    carPlate: ['', Validators.required],
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    this.serviceCenterName = this.auth.getServiceCenterName();

    const staffSnap = await getDocs(
      query(collection(this.firestore, 'staffs'), where('serviceCenterId', '==', this.serviceCenterId))
    );
    this.staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const driverSnap = await getDocs(
      query(collection(this.firestore, 'drivers'), where('serviceCenterId', '==', this.serviceCenterId))
    );
    this.drivers = driverSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Upload vehicle images (base64 + encrypted)
  async uploadVehicleImage(event: any) {
    const files: FileList = event.target.files;
    if (!files.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await this.convertToBase64(file);
        const encrypted = this.encryptData(base64);

        this.vehicleImages.push(encrypted);           // save encrypted to Firestore
        this.uploadedVehicleImages.push(base64);      // keep base64 for preview
      } catch (err) {
        console.error('Vehicle upload failed:', err);
        alert('Failed to upload vehicle image. Try again.');
      }
    }
  }

  // Upload driver image (base64 + encrypted)
  async uploadDriverImage(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    try {
      const base64 = await this.convertToBase64(file);
      this.driverImage = this.encryptData(base64);   // encrypted
      this.uploadedDriverImage = base64;                  // preview
    } catch (err) {
      console.error('Driver image upload failed:', err);
      alert('Failed to upload driver image. Try again.');
    }
  }

  async uploadDrivingLicense(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    try {
      const base64 = await this.convertToBase64(file);
      this.drivingLicenseImage = this.encryptData(base64);   // encrypted
      this.uploadedDrivingLicense = base64;                  // preview
    } catch (err) {
      console.error('Driving License upload failed:', err);
      alert('Failed to upload Driving License image. Try again.');
    }
  }

  // Helpers
  convertToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  encryptData(data: string): string {
    return CryptoJS.AES.encrypt(data, this.secretKey).toString();
  }

  decryptData(data: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(data, this.secretKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Decryption error:', error);
      return '';
    }
  }

  // Vehicle image
  viewVehicleImage(index: number) {
    this.selectedImage = this.uploadedVehicleImages[index];
    this.isImageModalOpen = true;
  }

  removeVehicleImage(index: number) {
    this.uploadedVehicleImages.splice(index, 1);
    this.vehicleImages.splice(index, 1); // remove encrypted copy as well
  }

  // IC image
  viewDriverImage() {
    this.selectedImage = this.uploadedDriverImage;
    this.isImageModalOpen = true;
  }

  removeDriverImage() {
    this.uploadedDriverImage = null;
    this.driverImage = null;
  }

  viewDrivingLicenseImage() {
    this.selectedImage = this.uploadedDrivingLicense;
    this.isImageModalOpen = true;
  }

  removeDrivingLicenseImage() {
    this.uploadedDrivingLicense = null;
    this.drivingLicenseImage = null;
  }

  closeImageModal() {
    this.isImageModalOpen = false;
    this.selectedImage = null;
  }

  // Staff add
  async addStaff() {

    try {
      this.loadingAddStaff = true;
      await addDoc(collection(this.firestore, 'staffs'), {
        serviceCenterId: this.serviceCenterId,
        serviceCenterName: this.serviceCenterName,
        ...this.staffForm.value,
        status: 'approved',
        createdAt: new Date()
      });

      const staffRef = collection(this.firestore, 'staffs');
      const q = query(staffRef, where('email', '==', this.staffForm.value.email));

      const staff = await getDocs(q);

      const data = await firstValueFrom(
        this.http.post<any>('http://localhost:3000/sendPasswordEmail/send', {
          toEmail: this.staffForm.value.email,
          requestId: staff.docs[0].id,
          type: 'staff'
        })
      );

      if (!data?.success) throw new Error(data?.error || 'Failed to send password');

      alert(`${this.staffForm.value.name} approved and password sent.`);
      this.staffForm.reset({ role: 'technician' });
      await this.load();
    } catch (error) {
      console.error('Error approving staff:', error);
      alert('Approval failed. Please try again.');
    }
    this.loadingAddStaff = false;
  }


  // Driver add
  async addDriver() {
    if (!this.driverImage || this.driverImage.length < 1) {
      alert('Please upload the driver image and at least 1 vehicle image.');
      return;
    }

    try {
      this.loadingAddDriver = true;
      await addDoc(collection(this.firestore, 'drivers'), {
        serviceCenterId: this.serviceCenterId,
        serviceCenterName: this.serviceCenterName,
        ...this.driverForm.value,
        vehicleImages: this.vehicleImages,
        drivingLicenseImage: this.drivingLicenseImage,
        driverImage: this.driverImage,
        status: 'approved',
        createdAt: new Date()
      });

      const towingDriverRef = collection(this.firestore, 'drivers');
      const q = query(towingDriverRef, where('email', '==', this.driverForm.value.email));

      const driver = await getDocs(q);

      const data = await firstValueFrom(
        this.http.post<any>('http://localhost:3000/sendPasswordEmail/send', {
          toEmail: this.driverForm.value.email,
          requestId: driver.docs[0].id,
          type: 'driver'
        })
      );

      if (!data?.success) throw new Error(data?.error || 'Failed to send password');

      alert(`Towing driver ${this.driverForm.value.name} approved and password sent.`);
      await this.load();

      this.driverForm.reset();
      this.vehicleImages = [];
      this.uploadedVehicleImages = [];
      this.drivingLicenseImage = null;
      this.uploadedDrivingLicense = null;
      this.driverImage = null;
      this.uploadedDriverImage = null;
      await this.load();
    } catch (error) {
      console.error('Error approving driver:', error);
      alert('Approval failed. Please try again.');
    }
    this.loadingAddDriver = false;
  }

  async removeStaff(staffId: string) {
    if (!confirm('Are you sure to remove this staff?')) return;

    try {
      const staffDoc = doc(this.firestore, 'staffs', staffId);
      await updateDoc(staffDoc, { status: 'removed' });
      alert('Staff removed.');
      await this.load();
    } catch (error) {
      console.error('Error removing staff:', error);
      alert('Removal failed. Please try again.');
    }
  }

  async removeDriver(driverId: string) {
    if (!confirm('Are you sure to remove this driver?')) return;

    try {
      const driverDoc = doc(this.firestore, 'drivers', driverId);
      await updateDoc(driverDoc, { status: 'removed' });
      alert('Driver removed.');
      await this.load();
    } catch (error) {
      console.error('Error removing driver:', error);
      alert('Removal failed. Please try again.');
    }
  }
}
