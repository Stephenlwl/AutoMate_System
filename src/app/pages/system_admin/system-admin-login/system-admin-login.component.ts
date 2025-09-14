import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AdminService } from '../auth/system-admin-auth';

@Component({
  selector: 'app-system-admin-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './system-admin-login.component.html',
  styleUrls: ['./system-admin-login.component.css']
})
export class LoginComponent {
  auth = inject(Auth);
  errorMessage = '';
  loading = false;
  form!: FormGroup;

  constructor(private fb: FormBuilder, private router: Router, private firestore: Firestore, private adminService: AdminService) { }

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }
  async login() {
    if (this.form.invalid) return;
    const { email, password } = this.form.value;

    this.loading = true;
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      const uid = cred.user.uid;

      const adminDocRef = doc(this.firestore, 'system_admins', uid);
      const adminSnap = await getDoc(adminDocRef);

      if (adminSnap.exists()) {
        const adminData = adminSnap.data();

        this.adminService.setAdmin({
          id: uid,
          name: adminData['name'] || 'Admin',
          email: adminData['email'] || email
        });

        this.router.navigate(['/systemAdmin/dashboard']);

      } else {
        this.errorMessage = 'You are not authorized to access this portal.';
      }
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Login failed. Check your credentials.';
    } finally {
      this.loading = false;
    }
  }

  getFirebaseError(code: string): string {
    switch (code) {
      case 'auth/user-not-found': return 'No user found with this email.';
      case 'auth/wrong-password': return 'Incorrect password.';
      case 'auth/invalid-email': return 'Invalid email address.';
      default: return 'Login failed. Please try again.';
    }
  }
}
