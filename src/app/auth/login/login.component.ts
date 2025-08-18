import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  auth = inject(Auth);
  errorMessage = '';
  loading = false;
  form!: FormGroup;

  constructor(private fb: FormBuilder, private router: Router, private firestore: Firestore) { }

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }
  login() {
    if (this.form.invalid) return;
    const { email, password } = this.form.value;

    this.loading = true;
    signInWithEmailAndPassword(this.auth, email, password)
      .then(async cred => {
        const uid = cred.user.uid;
        const systemAdminDoc = await getDoc(doc(this.firestore, 'system_admins', uid));
        if (systemAdminDoc.exists()) {
          this.router.navigate(['/systemAdmin/dashboard']);
        }
        else {
          this.errorMessage = 'You are not authorized to access this portal.';
        }
      })
      .catch(err => this.errorMessage = this.getFirebaseError(err.code))
      .finally(() => this.loading = false);
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
