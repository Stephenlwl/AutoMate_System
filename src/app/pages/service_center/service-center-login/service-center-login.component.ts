import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs, updateDoc, doc } from '@angular/fire/firestore';
import { Router, RouterLink } from '@angular/router';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-service-center-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './service-center-login.component.html',
  styleUrls: ['./service-center-login.component.css']
})
export class ServiceCenterLoginComponent {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private authService = inject(AuthService);

  form: FormGroup;
  loading = false;
  errorMessage = '';

  showPendingModal = false;
  pendingEmail = '';

  showRejectedModal = false;
  rejectedReason = '';

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  async login() {
    if (this.form.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    try {
      const email = this.form.value.email.trim();
      const password = this.form.value.password;

      const staffQuery = query(
        collection(this.firestore, 'staffs'),
        where('email', '==', email)
      );
      const staffSnapshot = await getDocs(staffQuery);

      if (!staffSnapshot.empty) {
        const staffDoc = staffSnapshot.docs[0].data() as any;
        const staffStatus = staffDoc.status || 'pending';

        if (staffStatus === 'pending') {
          this.pendingEmail = email;
          this.showPendingModal = true;
          return;
        }

        if (staffStatus === 'rejected') {
          this.rejectedReason = staffDoc.rejectionReason || 'No reason provided';
          this.showRejectedModal = true;
          return;
        }

        if (staffStatus === 'approved') {
          const hashedPassword = staffDoc?.password || '';
          const isMatch = await bcrypt.compare(password, hashedPassword);

          if (!isMatch) {
            this.errorMessage = 'Invalid email or password.';
            return;
          }

          const docId = staffSnapshot.docs[0].id;

          this.authService.setAdmin({
            id: docId,
            email: staffDoc.email,
            name: staffDoc.name,
            role: staffDoc.role,
            serviceCenterId: staffDoc.serviceCenterId,
            serviceCenterName: staffDoc.serviceCenterName,
          });

          const isLocationProvided = await this.updateServiceCenterStaffLocation(docId);
          if (isLocationProvided) {
            this.router.navigate(['/serviceCenter/dashboard']);
          }
          return; // staff login successful
        }
      }

      //else check service_centers
      const svcQuery = query(
        collection(this.firestore, 'service_centers'),
        where('adminInfo.email', '==', email)
      );
      const svcSnapshot = await getDocs(svcQuery);

      if (svcSnapshot.empty) {
        this.errorMessage = 'Invalid email or password.';
        return;
      }

      const userDoc = svcSnapshot.docs[0].data() as any;
      const status = userDoc.verification?.status || 'pending';

      if (status === 'pending') {
        this.pendingEmail = email;
        this.showPendingModal = true;
        return;
      }

      if (status === 'rejected') {
        this.rejectedReason = userDoc.verification?.rejectionReason || 'No reason provided';
        this.showRejectedModal = true;
        return;
      }

      if (status === 'approved') {
        const hashedPassword = userDoc.adminInfo?.password || '';
        const isMatch = await bcrypt.compare(password, hashedPassword);

        if (!isMatch) {
          this.errorMessage = 'Invalid email or password.';
          return;
        }

        const docId = svcSnapshot.docs[0].id;

        this.authService.setAdmin({
          id: docId,
          email: userDoc.adminInfo.email,
          name: userDoc.adminInfo.name,
          role: userDoc.adminInfo.role,
          serviceCenterName: userDoc.serviceCenterInfo.name,
        });

        const isLocationProvided = await this.updateServiceCenterLocation(docId);
        if (isLocationProvided) {
          this.router.navigate(['/serviceCenter/dashboard']);
        }
        return;
      }
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Login failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private async getCurrentLocation(): Promise<{ latitude: number, longitude: number } | null> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('Geolocation not supported by this browser.');
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            console.error('Location error:', error);
            switch (error.code) {
              case error.PERMISSION_DENIED:
                alert('Location permission is required. Please enable it in your browser settings.');
                break;
              case error.POSITION_UNAVAILABLE:
                alert('Location information is unavailable. Please check your device settings.');
                break;
              case error.TIMEOUT:
                alert('Location request timed out. Please try again.');
                break;
              default:
                alert('An unknown error occurred while fetching location.');
            }
            reject(error);
          }
        );
      }
    });
  }

  private async updateServiceCenterLocation(docId: string): Promise<boolean> {
    try {
      const location = await this.getCurrentLocation();
      if (location) {
        await updateDoc(doc(this.firestore, 'service_centers', docId), {
          'serviceCenterInfo.latitude': location.latitude,
          'serviceCenterInfo.longitude': location.longitude,
          updatedAt: new Date(),
        });
        console.log('Location updated in Firestore:', location);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Could not update location:', err);
      return false;
    }
  }

  private async updateServiceCenterStaffLocation(docId: string): Promise<boolean> {
    try {
      const location = await this.getCurrentLocation();
      if (location) {
        await updateDoc(doc(this.firestore, 'staffs', docId), {
          'serviceCenterInfo.latitude': location.latitude,
          'serviceCenterInfo.longitude': location.longitude,
          updatedAt: new Date(),
        });
        console.log('Location updated in Firestore:', location);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Could not update location:', err);
      return false;
    }
  }

  closePendingModal() {
    this.showPendingModal = false;
    this.pendingEmail = '';
  }

  closeRejectedModal() {
    this.showRejectedModal = false;
    this.rejectedReason = '';
  }

  reapply() {
    this.showRejectedModal = false;
    this.router.navigate(['/serviceCenter/signup'], {
      queryParams: { email: this.form.value.email, reapply: true }
    });
  }
}
