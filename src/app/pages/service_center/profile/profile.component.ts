import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import * as bcrypt from 'bcryptjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ServiceCenterProfileComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  serviceCenterId: string = '';
  adminName: string = '';
  adminEmail: string = '';
  isLoading: boolean = false;
  isPasswordSectionOpen: boolean = false;

  // Main form for profile info
  profileForm = this.fb.group({
    phone: ['', [Validators.pattern(/^[0-9+\-\s()]+$/)]]
  });

  // Separate form for password changes
  passwordForm = this.fb.group({
    currentPassword: [''],
    newPassword: ['', [
      Validators.required,
      Validators.minLength(8),
      this.passwordStrengthValidator
    ]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  async ngOnInit() {
    this.serviceCenterId = await this.auth.getServiceCenterId();
    this.adminName = this.auth.getAdminName() || '';
    this.adminEmail = this.auth.getAdminEmail() || '';
  }

  // Custom validators
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);

    const errors: ValidationErrors = {};
    if (!hasUpperCase) errors['uppercase'] = true;
    if (!hasLowerCase) errors['lowercase'] = true;
    if (!hasNumbers) errors['numbers'] = true;
    if (!hasSpecialChar) errors['specialChars'] = true;

    return Object.keys(errors).length ? errors : null;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    return newPassword && confirmPassword && newPassword !== confirmPassword
      ? { 'passwordMismatch': true }
      : null;
  }

  async changePassword() {
    if (this.passwordForm.invalid) {
      this.markFormGroupTouched(this.passwordForm);
      return;
    }

    this.isLoading = true;
    try {
      const hashedPassword = await bcrypt.hash(this.passwordForm.value.newPassword!, 10);
      await updateDoc(doc(this.firestore, 'service_centers', this.serviceCenterId), {
      'adminInfo.password': hashedPassword,
      'adminInfo.passwordChangedAt': new Date()
    });

      this.passwordForm.reset();
      this.isPasswordSectionOpen = false;

      alert('Password changed successfully!');
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Failed to change password. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  togglePasswordSection() {
    this.isPasswordSectionOpen = !this.isPasswordSectionOpen;
    if (!this.isPasswordSectionOpen) {
      this.passwordForm.reset();
    }
  }

  private markFormGroupTouched(formGroup: any) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control.markAsTouched();
    });
  }

  get name() { return this.profileForm.get('name'); }
  get email() { return this.profileForm.get('email'); }
  get phone() { return this.profileForm.get('phone'); }
  get newPassword() { return this.passwordForm.get('newPassword'); }
  get confirmPassword() { return this.passwordForm.get('confirmPassword'); }
}