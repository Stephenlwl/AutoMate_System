import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

@Component({
  selector: 'app-workshop-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './workshop-details.component.html',
  styleUrl: './workshop-details.component.css'
})
export class WorkshopDetailsComponent {
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
    const wid = await this.ctx.resolveWorkshopIdByEmail(this.auth.getEmail()!);
    this.docId = wid!;
    const snap = await getDoc(doc(this.fs,'repair_service_centers', this.docId));
    const w:any = snap.data();
    this.form.patchValue({
      name: w?.workshopInfo?.name || '',
      registrationNumber: w?.workshopInfo?.registrationNumber || '',
      addressLine1: w?.workshopInfo?.address?.addressLine1 || '',
      addressLine2: w?.workshopInfo?.address?.addressLine2 || '',
      city: w?.workshopInfo?.address?.city || '',
      state: w?.workshopInfo?.address?.state || '',
      postalCode: w?.workshopInfo?.address?.postalCode || ''
    });
  }

  async save(){
    await updateDoc(doc(this.fs,'repair_service_centers', this.docId), {
      workshopInfo: {
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