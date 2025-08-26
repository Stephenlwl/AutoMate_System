import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

@Component({
  selector: 'app-service-center-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './service-center-details.component.html',
  styleUrl: './service-center-details.component.css'
})
export class ServiceCenterDetailsComponent {
private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name:[''], registrationNumber:[''],
    addressLine1:[''], addressLine2:[''], city:[''], state:[''], postalCode:['']
  });
  docId!:string;

  async ngOnInit(){
    const wid = await this.ctx.resolveServiceCenterIdByEmail(this.auth.getEmail()!);
    this.docId = wid!;
    const snap = await getDoc(doc(this.fs,'service_centers', this.docId));
    const w:any = snap.data();
    this.form.patchValue({
      name: w?.serviceCenterInfo?.name || '',
      registrationNumber: w?.serviceCenterInfo?.registrationNumber || '',
      addressLine1: w?.serviceCenterInfo?.address?.addressLine1 || '',
      addressLine2: w?.serviceCenterInfo?.address?.addressLine2 || '',
      city: w?.serviceCenterInfo?.address?.city || '',
      state: w?.serviceCenterInfo?.address?.state || '',
      postalCode: w?.serviceCenterInfo?.address?.postalCode || ''
    });
  }

  async save(){
    await updateDoc(doc(this.fs,'service_centers', this.docId), {
      serviceCenterInfo: {
        name: this.form.value.name,
        registrationNumber: this.form.value.registrationNumber,
        address: {
          addressLine1: this.form.value.addressLine1,
          addressLine2: this.form.value.addressLine2,
          city: this.form.value.city,
          state: this.form.value.state,
          postalCode: this.form.value.postalCode
        }
      }
    });
    alert('Saved.');
  }
}