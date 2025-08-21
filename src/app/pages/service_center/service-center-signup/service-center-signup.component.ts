import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormControl } from '@angular/forms';
import { Firestore, collection, addDoc, query, where, getDocs } from '@angular/fire/firestore';
import * as bcrypt from 'bcryptjs';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { getStates, getCities, getPostcodes } from 'malaysia-postcodes';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-service-center-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, RouterLink],
  templateUrl: './service-center-signup.component.html',
  styleUrls: ['./service-center-signup.component.css']
})

export class ServiceCenterSignupComponent {
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);
  private http = inject(HttpClient);

  ngOnInit() {
    this.malaysiaStates = getStates();
    this.setupOperatingHoursWatcher();
  }

  step = 1;
  maxSteps = 4;
  loading = false;
  errorMessage = '';
  infoMessage = '';

  otpSent = false;
  enteredOtp = '';
  otpTimer: any;
  otpExpiryTime = 0;
  otpCountdown = 0;
  otpExpired = false;
  otpUnmatched = false;

  isEmailVerified = false;
  otpLoading = false;
  verifyLoading = false;
  pendingEmail = '';

  malaysiaStates: string[] = [];
  malaysiaCities: string[] = [];

  form: FormGroup;

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  documentFields = [
    { name: 'ssm', label: 'SSM Document (Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' },
    { name: 'serviceCenterPhoto', label: 'Service Center Photo (Image only) *', accept: '.jpg,.jpeg,.png' },
    { name: 'businessLicense', label: 'Business License (Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' },
    { name: 'adminIC', label: 'Admin IC (Front & Back, Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' }
  ];

  constructor() {
    this.form = this.fb.group({
      adminName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      otp: [{ value: '', disabled: true }, [Validators.required]],
      serviceCenterPhoneNo: ['', [Validators.required, Validators.pattern(/^(6?0)[0-9]{8,10}$/)]],
      password: ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)]],
      confirmPassword: ['', Validators.required],

      serviceCenterName: ['', Validators.required],
      registrationNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{12}$/)]],
      state: ['', Validators.required],
      city: ['', Validators.required],
      postalCode: ['', Validators.required],
      addressLine1: ['', Validators.required],
      addressLine2: [''],
      // Services offered
      // services: this.fb.array([], Validators.required),

      operatingHours: this.fb.array(
        this.daysOfWeek.map(day =>
          this.fb.group({
            day: [day],
            isClosed: [false],
            open: ['09:00'],
            close: ['18:00']
          })
        )
      ),

      ssm: ['', Validators.required],
      serviceCenterPhoto: ['', Validators.required],
      businessLicense: ['', Validators.required],
      adminIC: ['', Validators.required],

      // offersTowing: [false],
      // towingServices: this.fb.array([], Validators.required)
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(formGroup: FormGroup) {
    const passwordControl = formGroup.get('password');
    const confirmPasswordControl = formGroup.get('confirmPassword');

    if (!passwordControl || !confirmPasswordControl) return null;

    if (confirmPasswordControl.errors && !confirmPasswordControl.errors['passwordMismatch']) {
      return null;
    }

    if (passwordControl.value !== confirmPasswordControl.value) {
      confirmPasswordControl.setErrors({ passwordMismatch: true });
    } else {
      confirmPasswordControl.setErrors(null);
    }

    return null;
  }

  async sendOtp() {
    if (!this.form.get('email')?.valid) {
      this.errorMessage = 'Enter a valid email before sending OTP.';
      return;
    }

    const adminEmail = this.form.value.email;
    this.otpLoading = true;

    try {
      // check existing application
      const q = query(
        collection(this.firestore, 'repair_service_centers'),
        where('adminInfo.email', '==', adminEmail.toLowerCase())
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existing = snapshot.docs[0].data() as any;
        const status = existing.verification?.status || '';

        if (status === 'pending') {
          this.pendingEmail = adminEmail;
          this.errorMessage = 'Your application is still pending. * Please note that the admin will takes 1-2 working days to review.';
          this.otpLoading = false;
          return;
        }
        if (status === 'approved') {
          this.errorMessage = 'This email is already registered and approved. Please log in instead.';
          this.otpLoading = false;
          return;
        }
        if (status === 'rejected') {
          this.fillFormWithRejectedData(existing);
          alert("Your previous application was rejected. Please refer to the rejected reason send via email.");
        }
      }

      try {
        const response = await fetch('http://localhost:3000/sendOtpEmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: adminEmail
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to send OTP");
        } else {
          this.form.get('otp')?.enable();
          this.otpExpiryTime = Date.now() + 60 * 1000;
          this.otpCountdown = 60;
          this.startOtpCountdown();
          this.otpSent = true;
          this.infoMessage = 'OTP sent to your email. Please check your inbox.';
          this.errorMessage = '';
        }
      } catch (error) {
        this.errorMessage = 'Failed to send OTP. Please try again.';
        console.error("Error sending OTP:", error);
      }
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Failed to send OTP. Please try again.';
      this.form.get('otp')?.disable();
    } finally {
      this.otpLoading = false;
    }
  }

  startOtpCountdown() {
    this.otpExpired = false;
    clearInterval(this.otpTimer);
    this.otpTimer = setInterval(() => {
      if (this.otpCountdown > 0) {
        this.otpCountdown--;
      } else {
        this.otpExpired = true;
        clearInterval(this.otpTimer);
        if (!this.isEmailVerified && this.otpUnmatched) {
          this.otpUnmatched = false;
        } else {
          this.infoMessage = '';
          this.errorMessage = 'OTP expired. Please request a new one.';
          this.form.get('otp')?.disable();
          this.otpSent = false;
        }
      }
    }, 1000);
  }

  async verifyOtp() {
    this.verifyLoading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    const otpValue = this.form.get('otp')?.value;
    const email = this.form.get('email')?.value;

    try {
      const res = await fetch('http://localhost:3000/sendOtpEmail/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: email, otpInput: otpValue })
      });

      const data = await res.json();

      if (data.success) {
        this.isEmailVerified = true;
        this.form.get('otp')?.disable();
        this.infoMessage = data.message;
      } else {
        alert(data.message);
        this.form.get('otp')?.setValue('');
        this.form.get('otp')?.disable();
        this.errorMessage = data.message;
        this.otpUnmatched = true;
        this.otpCountdown = 0;
        this.otpSent = false;
      }
    } catch (err) {
      this.errorMessage = 'Verification failed. Please try again.';
    } finally {
      this.verifyLoading = false;
    }
  }


  get operatingHoursArray() {
    return this.form.get('operatingHours') as FormArray;
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

      // Initial state handling
      if (isClosedControl?.value) {
        openControl?.disable();
        closeControl?.disable();
      }
    });
  }

  onStateChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.malaysiaCities = getCities(value);
    this.form.patchValue({ city: '' });
  }

  onCityChange(event: Event) {
    const city = (event.target as HTMLSelectElement).value;
    const state = this.form.get('state')?.value;

    if (state && city) {
      const postcodes = getPostcodes(state, city);
      if (postcodes.length > 0) {
        this.form.patchValue({ postalCode: postcodes[0] }); // take the first postcode
      } else {
        this.form.patchValue({ postalCode: '' });
      }
    }
  }

  handleFileBase64(event: any, controlName: string) {
    const file = event.target.files[0];
    if (!file) return;

    // Check size for max till 900 KB due to Firestore limits
    if (file.size > 900 * 1024) {
      alert(controlName + ' File is too large. Please upload a file under 900 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string);
      this.form.patchValue({
        [controlName]: base64String,
      });
    };
    reader.readAsDataURL(file);
  }

  nextStep() {
    let controlsToCheck: string[] = [];

    if (this.step === 1) {
      controlsToCheck = ['adminName', 'email', 'serviceCenterPhoneNo', 'password', 'confirmPassword'];
    } else if (this.step === 2) {
      controlsToCheck = ['serviceCenterName', 'registrationNumber', 'addressLine1', 'state', 'city', 'postalCode'];
    }
    // else if (this.step === 3) {
    //   this.servicesArray.markAsTouched();
    //   if (this.servicesArray.invalid) {
    //     this.errorMessage = 'Please select at least one service.';
    //     return;
    //   }
    //   controlsToCheck = ['services'];
    // } 
    else if (this.step === 5) {
      controlsToCheck = ['ssm', 'serviceCenterPhoto', 'businessLicense', 'adminIC'];

      // if (this.form.value.offersTowing) {
      //   this.towingServicesArray.markAsTouched();
      //   if (this.towingServicesArray.invalid) {
      //     this.errorMessage = 'Please select at least one towing service.';
      //     return;
      //   }
      // }
    }

    // Mark controls as touched so errors show
    controlsToCheck.forEach(ctrl => {
      this.form.get(ctrl)?.markAsTouched();
    });

    // Check if all required fields for this step are valid
    const isValid = controlsToCheck.every(ctrl => this.form.get(ctrl)?.valid);
    if (!this.isEmailVerified) {
      this.errorMessage = 'Please verify your email address before proceeding.';
      return;
    }
    else if (!isValid) {
      this.errorMessage = 'Please fill in all required fields before continuing.';
      return;
    }

    // Move to next step
    this.errorMessage = '';
    if (this.step < this.maxSteps) this.step++;
  }

  prevStep() {
    if (this.step > 1) this.step--;
    this.errorMessage = '';
  }

  async submit() {
    if (this.form.invalid || this.form.value.password !== this.form.value.confirmPassword) {
      this.errorMessage = 'Please check on your registration form for any errors.';
      return;
    }
    this.loading = true;
    try {
      const hashedPassword = await bcrypt.hash(this.form.value.password, 10);
      const payload = {
        adminInfo: {
          name: this.form.value.adminName,
          email: this.form.value.email,
          password: hashedPassword
        },
        serviceCenterInfo: {
          name: this.form.value.serviceCenterName,
          registrationNumber: this.form.value.registrationNumber,
          serviceCenterPhoneNo: this.form.value.serviceCenterPhoneNo,
          address: {
            addressLine1: this.form.value.addressLine1,
            addressLine2: this.form.value.addressLine2 || '',
            postalCode: this.form.value.postalCode,
            city: this.form.value.city,
            state: this.form.value.state
          },
        },
        operatingHours: this.form.value.operatingHours,
        documents: {
          ssm: this.form.value.ssm || '',
          serviceCenterPhoto: this.form.value.serviceCenterPhoto || '',
          businessLicense: this.form.value.businessLicense || '',
          adminIC: this.form.value.adminIC || ''
        },
        verification: { status: 'pending', rejectionReason: '' },
        createdAt: new Date()
      };
      await addDoc(collection(this.firestore, 'repair_service_centers'), payload);
      alert('Your application has been submitted for approval. (*Please note that the admin will takes 1-2 working days to review.)');
      this.form.reset();
      this.isEmailVerified = false;
      this.errorMessage = '';
      this.infoMessage = '';
      this.step = 1;
    } catch (err: any) {
      this.errorMessage = err.message + ' ' + 'Sum of file sizes is too large. Please upload files under 900 KB.';
    } finally {
      this.loading = false;
    }
  }

  fillFormWithRejectedData(data: any) {
    // Admin Info
    this.form.patchValue({
      email: data.adminInfo?.email || '',
    });

    // Service Center Info
    this.form.patchValue({
      serviceCenterName: data.serviceCenterInfo?.name || '',
      addressLine1: data.serviceCenterInfo?.address?.addressLine1 || '',
      addressLine2: data.serviceCenterInfo?.address?.addressLine2 || ''
    });

    // Operating Hours
    this.operatingHoursArray.patchValue(data.operatingHours || []);

    this.errorMessage = 'Please refer to the email to re-submmit your application';
  }

}
