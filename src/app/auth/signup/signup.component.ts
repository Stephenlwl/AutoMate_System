import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})

export class SignupComponent {
  auth = inject(Auth);
  errorMessage = '';
  loading = false;
  form!: FormGroup;

  constructor(private fb: FormBuilder, private router: Router, private firestore: Firestore) {}

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  signup() {
    if (this.form.invalid || this.form.value.password !== this.form.value.confirmPassword) {
      this.errorMessage = "Passwords do not match.";
      return;
    }

    const { email, password } = this.form.value;
    this.loading = true;

    createUserWithEmailAndPassword(this.auth, email, password)
      .then(cred => {
        const systemAdminId = cred.user.uid;
        const systemAdminRef = doc(this.firestore, 'system_admins', systemAdminId);
        return setDoc(systemAdminRef, {
          systemAdminId,
          email,
          role: 'system admin',
          createdAt: new Date(),
        });
      }).then(() => this.router.navigate(['/systemAdmin/login']))
      .catch(err => this.errorMessage = this.getFirebaseError(err.code))
      .finally(() => this.loading = false);
  }

  getFirebaseError(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use': return 'Email already in use.';
      case 'auth/invalid-email': return 'Invalid email.';
      default: return 'Sign up failed. Please try again.';
    }
  }
}
