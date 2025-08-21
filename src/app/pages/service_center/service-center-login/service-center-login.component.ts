import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
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

      const q = query(
        collection(this.firestore, 'repair_service_centers'),
        where('adminInfo.email', '==', email)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.errorMessage = 'Invalid email or password.';
        return;
      }

      const userDoc = snapshot.docs[0].data() as any;
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
        // Validate password
        const hashedPassword = userDoc.adminInfo?.password || '';
        const isMatch = await bcrypt.compare(password, hashedPassword);

        if (!isMatch) {
          this.errorMessage = 'Invalid email or password.';
          return;
        }

        this.authService.setAdmin({
          id: snapshot.docs[0].id,
          email: userDoc.adminInfo.email,
          name: userDoc.adminInfo.name,
          serviceCenterName: userDoc.serviceCenterInfo.name,
        });

        // Navigate to dashboard
        this.router.navigate(['/serviceCenter/dashboard']);
      }
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Login failed. Please try again.';
    } finally {
      this.loading = false;
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
