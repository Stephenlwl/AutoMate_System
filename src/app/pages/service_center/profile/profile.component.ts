import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import * as bcrypt from 'bcryptjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ServiceCenterProfileComponent {
 private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);
  docId!:string;

  form = this.fb.group({ name:['', Validators.required], phone:['', Validators.required], password:[''] });

  async ngOnInit(){
    const wid = await this.ctx.resolveWorkshopIdByEmail(this.auth.getEmail()!);
    this.docId = wid!;
    const snap = await getDoc(doc(this.fs,'repair_service_centers', this.docId));
    const a:any = snap.data()?.['adminInfo'];
    this.form.patchValue({ name: a?.name || '', phone: a?.phone || '' });
  }
  async save(){
    const updates:any = { adminInfo: { name:this.form.value.name, phone:this.form.value.phone } };
    if (this.form.value.password) {
      updates.adminInfo.password = await bcrypt.hash(this.form.value.password, 10);
    }
    await updateDoc(doc(this.fs,'repair_service_centers', this.docId), updates);
    alert('Saved.');
  }
}