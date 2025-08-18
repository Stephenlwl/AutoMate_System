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

  otpSent = false;
  generatedOtp = '';
  enteredOtp = '';
  otpTimer: any;
  otpExpiryTime = 0;
  otpCountdown = 0;

  isEmailVerified = false;
  otpLoading = false;
  verifyLoading = false;
  pendingEmail = '';

  malaysiaStates: string[] = [];
  malaysiaCities: string[] = [];
  // selectedTowingServices: string[] = [];

  form: FormGroup;

  // predefinedServices = [
  //   'Oil Change',
  //   'Engine Repair',
  //   'Brake Service',
  //   'Air Conditioning',
  //   'Tyre Replacement',
  //   'Battery Replacement',
  //   'Wheel Alignment'
  // ];

  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // towingServiceOptions = [
  //   { name: 'Vehicle Breakdown' },
  //   { name: 'Flat Tire / Tire Burst' },
  //   { name: 'Battery Dead' },
  //   { name: 'Locked Out / Lost Key' },
  //   { name: 'Accident / Collision' },
  //   { name: 'Engine Overheating / Engine Failure' }
  // ];

  documentFields = [
    { name: 'ssm', label: 'SSM Document (Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' },
    { name: 'workshopPhoto', label: 'Workshop Photo (Image only) *', accept: '.jpg,.jpeg,.png' },
    { name: 'businessLicense', label: 'Business License (Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' },
    { name: 'adminIC', label: 'Admin IC (Front & Back, Image / PDF) *', accept: '.jpg,.jpeg,.png,.pdf' }
  ];

  constructor() {
    this.form = this.fb.group({
      // Step 1: Admin info
      adminName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      otp: [{ value: '', disabled: true }, [Validators.required]],
      phone: ['', [Validators.required, Validators.pattern(/^(6?0)[0-9]{9,10}$/)]],
      password: ['', [Validators.required, Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/)]],
      confirmPassword: ['', Validators.required],

      // Step 2: Workshop info
      workshopName: ['', Validators.required],
      registrationNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{12}$/)]],
      state: ['', Validators.required],
      city: ['', Validators.required],
      postalCode: ['', Validators.required],
      addressLine1: ['', Validators.required],
      addressLine2: ['', Validators.required],

      // Step 3: Services offered
      // services: this.fb.array([], Validators.required),

      // Step 4: Operating hours
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

      // Step 5: Documents
      ssm: ['', Validators.required],
      workshopPhoto: ['', Validators.required],
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
      return null; // Other validators still active
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
      // 1. Check existing application
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
      this.generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      await fetch('http://localhost:3000/sendOtpEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: adminEmail,
          otpCode: this.generatedOtp
        })
      });

      this.form.get('otp')?.enable();
      this.otpExpiryTime = Date.now() + 60 * 1000;
      this.otpCountdown = 60;
      this.startOtpCountdown();
      this.otpSent = true;
      alert('OTP sent to your email. Please check your inbox.');
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Failed to send OTP. Please try again.';
      this.form.get('otp')?.disable();
    } finally {
      this.otpLoading = false;
    }
  }

  startOtpCountdown() {
    clearInterval(this.otpTimer);
    this.otpTimer = setInterval(() => {
      if (this.otpCountdown > 0) {
        this.otpCountdown--;
      } else {
        clearInterval(this.otpTimer);
        if (!this.isEmailVerified) {
        }
      }
    }, 1000);
  }

  verifyOtp() {
    this.verifyLoading = true;

    if (!this.otpExpiryTime || Date.now() > this.otpExpiryTime) {
      this.errorMessage = 'OTP has expired. Please request a new OTP.';
      this.generatedOtp = '';
      this.otpSent = false;
      this.verifyLoading = false;
      this.form.get('otp')?.disable();
      return;
    }

    if (this.form.get('otp')?.value === this.generatedOtp) {
      this.isEmailVerified = true;
      this.errorMessage = '';
      this.verifyLoading = false;
      this.form.get('otp')?.disable();
    } else {
      this.generatedOtp = '';
      this.errorMessage = 'Invalid OTP. Please Request a New OTP to verify your email.';
      this.verifyLoading = false;
      this.otpSent = false;
      clearInterval(this.otpTimer);
      this.otpCountdown = 0;
      this.form.get('otp')?.disable();
      return;
    }
  }

  // get servicesArray() {
  //   return this.form.get('services') as FormArray;
  // }

  get operatingHoursArray() {
    return this.form.get('operatingHours') as FormArray;
  }

  // get towingServicesArray() {
  //   return this.form.get('towingServices') as FormArray;
  // }

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

  // toggleService(service: string) {
  //   const index = this.servicesArray.value.indexOf(service);
  //   if (index === -1) {
  //     this.servicesArray.push(this.fb.control(service));
  //   } else {
  //     this.servicesArray.removeAt(index);
  //   }
  //   this.servicesArray.markAsTouched();
  // }

  // toggleTowingService(serviceName: string) {
  //   const index = this.towingServicesArray.value.indexOf(serviceName);
  //   if (index === -1) {
  //     this.towingServicesArray.push(this.fb.control(serviceName));
  //   } else {
  //     this.towingServicesArray.removeAt(index);
  //   }
  //   this.towingServicesArray.markAsTouched();
  // }


  // offerTowingService(value: boolean) {
  //   this.form.patchValue({ offersTowing: value });
  //   if (!value) {
  //     this.towingServicesArray.clear();
  //     this.towingServicesArray.clearValidators();
  //   } else {
  //     this.towingServicesArray.setValidators(Validators.required);
  //   }
  //   this.towingServicesArray.updateValueAndValidity();
  // }

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
      controlsToCheck = ['adminName', 'email', 'phone', 'password', 'confirmPassword'];
    } else if (this.step === 2) {
      controlsToCheck = ['workshopName', 'registrationNumber', 'addressLine1', 'state', 'city', 'postalCode'];
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
      controlsToCheck = ['ssm', 'workshopPhoto', 'businessLicense', 'adminIC'];

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
          phone: this.form.value.phone,
          password: hashedPassword
        },
        workshopInfo: {
          name: this.form.value.workshopName,
          registrationNumber: this.form.value.registrationNumber,
          address: {
            addressLine1: this.form.value.addressLine1,
            addressLine2: this.form.value.addressLine2 || '',
            postalCode: this.form.value.postalCode,
            city: this.form.value.city,
            state: this.form.value.state
          },
        },
        // services: this.form.value.services,
        operatingHours: this.form.value.operatingHours,
        documents: {
          ssm: this.form.value.ssm || '',
          workshopPhoto: this.form.value.workshopPhoto || '',
          businessLicense: this.form.value.businessLicense || '',
          adminIC: this.form.value.adminIC || ''
        },
        // towing: {
        //   offers: this.form.value.offersTowing,
        //   towingServices: [...(this.form.value.towingServices || [])]
        // },
        verification: { status: 'pending', rejectionReason: '' },
        createdAt: new Date()
      };
      await addDoc(collection(this.firestore, 'repair_service_centers'), payload);
      alert('Your application has been submitted for approval. * Please note that the admin will takes 1-2 working days to review.');
      this.form.reset();
      this.isEmailVerified = false;
      this.errorMessage = '';
      this.step = 1;
    } catch (err: any) {
      this.errorMessage = err.message;
    } finally {
      this.loading = false;
    }
  }

  fillFormWithRejectedData(data: any) {
    // Admin Info
    this.form.patchValue({
      adminName: data.adminInfo?.name || '',
      email: data.adminInfo?.email || '',
      phone: data.adminInfo?.phone || ''
    });

    // Workshop Info
    this.form.patchValue({
      workshopName: data.workshopInfo?.name || '',
      addressLine1: data.workshopInfo?.address?.addressLine1 || '',
      addressLine2: data.workshopInfo?.address?.addressLine2 || ''
    });

    // Services
    // this.servicesArray.clear();
    // (data.services || []).forEach((srv: string) => {
    //   this.servicesArray.push(this.fb.control(srv));
    // });

    // Operating Hours
    this.operatingHoursArray.patchValue(data.operatingHours || []);

    // Towing
    // this.form.patchValue({
    //   offersTowing: data.towing?.offers || false
    // });
    // this.towingServicesArray.clear();
    // (data.towing?.towingServices || []).forEach((srv: string) => {
    //   this.towingServicesArray.push(this.fb.control(srv));
    // });

    this.errorMessage = 'Please refer to the email to re-submmit your application';
  }

}
